#!/usr/bin/env python3
"""
Vorschaubilder (Cover) von Instagram holen — und Reels eines Accounts finden.

Warum dieses Skript?
  Instagram gibt Profile nicht mehr anonym über die Weboberfläche heraus.
  Zwei öffentliche Endpunkte funktionieren aber weiterhin und liefern die
  Beitragsliste eines öffentlichen Accounts inklusive Shortcode und Cover:

    1. /api/v1/feed/user/<account>/username/     (liefert am zuverlässigsten)
    2. /api/v1/users/web_profile_info/?username= (Fallback)

  Beide sind unregelmäßig rate-limitiert und antworten dann mit 400/401 —
  das Skript probiert deshalb beide, mehrfach und mit Pause dazwischen.

Warum die Cover lokal speichern?
  Instagram-CDN-URLs sind signiert und laufen nach kurzer Zeit ab. Ein direkt
  eingebundener Link wäre nach wenigen Tagen ein toter Platzhalter. Lokal
  gespeichert bleiben die Bilder stabil, laden schneller, und beim
  Seitenaufruf fließen keine Besucherdaten an Meta.

Verwendung
  python3 tools/instagram-covers.py list <account>      Beiträge auflisten
  python3 tools/instagram-covers.py fetch [reels.txt]   Cover herunterladen
  python3 tools/instagram-covers.py avatars [account …] Profilbilder holen

Nach `list` den passenden Shortcode in tools/reels.txt eintragen, `fetch`
laufen lassen und die Kachel in public/index.html auf das Bild zeigen lassen.
Die Bilder werden auf 540 px Breite verkleinert (die Kacheln sind deutlich
kleiner, das spart ein Vielfaches an Ladezeit).

`avatars` legt die Profilbilder unter public/img/avatars/<account>.jpg ab —
ohne Argument für alle Accounts aus tools/reels.txt. Sie ändern sich
gelegentlich, ein erneuter Lauf holt einfach den aktuellen Stand.
"""
import json
import os
import subprocess
import sys
import time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = os.path.join(ROOT, "public", "img", "cases")
AVATAR_DIR = os.path.join(ROOT, "public", "img", "avatars")
LIST_FILE = os.path.join(ROOT, "tools", "reels.txt")
MAX_WIDTH = 540
JPEG_QUALITY = 80

UA = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36")
IG_APP_ID = "936619743392459"


# --------------------------------------------------------------------------
# Instagram abfragen
# --------------------------------------------------------------------------
def _get_json(url):
    proc = subprocess.run(
        ["curl", "-s", "--max-time", "30", "-A", UA,
         "-H", "x-ig-app-id: " + IG_APP_ID,
         "-H", "Referer: https://www.instagram.com/",
         "-H", "Accept: */*", url],
        capture_output=True, text=True)
    try:
        return json.loads(proc.stdout)
    except Exception:
        return {}


def _from_v1_items(items):
    posts = []
    for node in items:
        candidates = (node.get("image_versions2") or {}).get("candidates") or []
        cover = max(candidates, key=lambda c: c.get("width", 0)).get("url", "") if candidates else ""
        caption = ((node.get("caption") or {}).get("text") or "").replace("\n", " ")
        posts.append({
            "shortcode": node.get("code"),
            "is_video": node.get("media_type") == 2,
            "views": node.get("play_count") or node.get("view_count"),
            "likes": node.get("like_count"),
            "cover": cover,
            "caption": caption[:70],
        })
    return posts


def _from_graphql_user(user):
    posts = []
    for edge in user.get("edge_owner_to_timeline_media", {}).get("edges", []):
        node = edge["node"]
        caption_edges = node.get("edge_media_to_caption", {}).get("edges") or [{}]
        caption = caption_edges[0].get("node", {}).get("text", "").replace("\n", " ")
        posts.append({
            "shortcode": node.get("shortcode"),
            "is_video": node.get("is_video"),
            "views": node.get("video_view_count"),
            "likes": node.get("edge_liked_by", {}).get("count"),
            "cover": node.get("display_url"),
            "caption": caption[:70],
        })
    return posts


ENDPOINTS = [
    "https://www.instagram.com/api/v1/feed/user/{a}/username/?count=24",
    "https://i.instagram.com/api/v1/feed/user/{a}/username/?count=24",
    "https://www.instagram.com/api/v1/users/web_profile_info/?username={a}",
    "https://i.instagram.com/api/v1/users/web_profile_info/?username={a}",
]


def recent_posts(account, rounds=3):
    """Die letzten Beiträge eines öffentlichen Accounts. [] wenn nichts geht."""
    for attempt in range(rounds):
        for template in ENDPOINTS:
            data = _get_json(template.format(a=account))
            if data.get("items"):
                return _from_v1_items(data["items"])
            user = (data.get("data") or {}).get("user")
            if user:
                return _from_graphql_user(user)
            time.sleep(4)
        time.sleep(10 * (attempt + 1))
    return []


def profile_picture(account, rounds=3):
    """(url, anzeigename) des Profilbilds. HD (320 px) wenn erreichbar,
    sonst die 150-px-Variante aus dem Feed-Endpunkt."""
    for attempt in range(rounds):
        for template in ENDPOINTS:
            data = _get_json(template.format(a=account))
            user = (data.get("data") or {}).get("user")
            if user:
                pic = user.get("profile_pic_url_hd") or user.get("profile_pic_url")
                if pic:
                    return pic, user.get("full_name", "")
            items = data.get("items") or []
            if items:
                owner = items[0].get("user") or {}
                if owner.get("profile_pic_url"):
                    return owner["profile_pic_url"], owner.get("full_name", "")
            time.sleep(4)
        time.sleep(10 * (attempt + 1))
    return None, ""


# --------------------------------------------------------------------------
# Bilder speichern
# --------------------------------------------------------------------------
def shrink(path):
    """Cover auf Kachelgröße bringen. Ohne Pillow bleibt das Original liegen."""
    try:
        from PIL import Image
    except ImportError:
        print("   Hinweis: 'pip install Pillow' verkleinert die Cover automatisch.")
        return
    image = Image.open(path).convert("RGB")
    width, height = image.size
    if width > MAX_WIDTH:
        image = image.resize((MAX_WIDTH, max(1, round(height * MAX_WIDTH / width))),
                             Image.LANCZOS)
    image.save(path, "JPEG", quality=JPEG_QUALITY, optimize=True, progressive=True)


def download(account, shortcode, posts_cache):
    if account not in posts_cache:
        posts_cache[account] = recent_posts(account)
        time.sleep(3)
    post = next((p for p in posts_cache[account] if p["shortcode"] == shortcode), None)
    if not post or not post.get("cover"):
        return False, "nicht in den letzten Beiträgen gefunden"

    target = os.path.join(OUT_DIR, "%s-%s.jpg" % (account, shortcode))
    subprocess.run(["curl", "-sL", "--max-time", "60", "-A", UA,
                    post["cover"], "-o", target], capture_output=True)
    if not os.path.exists(target) or os.path.getsize(target) < 3000:
        if os.path.exists(target):
            os.remove(target)
        return False, "Download fehlgeschlagen"

    shrink(target)
    return True, "%d KB" % (os.path.getsize(target) // 1024)


# --------------------------------------------------------------------------
# Kommandos
# --------------------------------------------------------------------------
def cmd_list(account):
    posts = recent_posts(account)
    if not posts:
        print("Keine Daten für @%s — Instagram drosselt gerade. "
              "In ein paar Minuten erneut versuchen." % account)
        return 1
    print("\n%-14s %-6s %-10s %-8s %s" % ("SHORTCODE", "TYP", "VIEWS", "LIKES", "CAPTION"))
    print("-" * 92)
    for post in posts:
        print("%-14s %-6s %-10s %-8s %s" % (
            post["shortcode"],
            "Reel" if post["is_video"] else "Foto",
            post["views"] if post["views"] is not None else "-",
            post["likes"] if post["likes"] is not None else "-",
            post["caption"]))
    print("\n%d Beiträge. Shortcode in tools/reels.txt eintragen, dann: "
          "python3 tools/instagram-covers.py fetch" % len(posts))
    return 0


def read_list(list_file):
    """[(account, shortcode)] aus reels.txt, ohne Dubletten."""
    wanted = []
    for line in open(list_file, encoding="utf-8"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) >= 2 and (parts[0], parts[1]) not in wanted:
            wanted.append((parts[0], parts[1]))
    return wanted


def cmd_avatars(accounts):
    if not accounts:
        if not os.path.exists(LIST_FILE):
            print("Weder Accounts angegeben noch %s gefunden." % LIST_FILE)
            return 1
        seen = []
        for account, _ in read_list(LIST_FILE):
            if account not in seen:
                seen.append(account)
        accounts = seen

    os.makedirs(AVATAR_DIR, exist_ok=True)
    ok = failed = 0
    print("\n%-22s %s" % ("ACCOUNT", "ERGEBNIS"))
    print("-" * 62)
    for index, account in enumerate(accounts):
        url, name = profile_picture(account)
        if not url:
            print("%-22s kein Profilbild erreichbar (Drosselung?)" % account)
            failed += 1
            continue
        target = os.path.join(AVATAR_DIR, account + ".jpg")
        subprocess.run(["curl", "-sL", "--max-time", "60", "-A", UA, url, "-o", target],
                       capture_output=True)
        if not os.path.exists(target) or os.path.getsize(target) < 1000:
            if os.path.exists(target):
                os.remove(target)
            print("%-22s Download fehlgeschlagen" % account)
            failed += 1
            continue
        print("%-22s %d KB  %s" % (account, os.path.getsize(target) // 1024, name))
        ok += 1
        if index != len(accounts) - 1:
            time.sleep(5)

    print("\n%d Profilbilder geladen, %d fehlgeschlagen." % (ok, failed))
    return 0


def cmd_fetch(list_file):
    if not os.path.exists(list_file):
        print("Liste nicht gefunden: %s" % list_file)
        return 1
    os.makedirs(OUT_DIR, exist_ok=True)

    wanted = read_list(list_file)
    cache = {}
    ok = failed = 0
    print("\n%-22s %-14s %s" % ("ACCOUNT", "SHORTCODE", "ERGEBNIS"))
    print("-" * 74)
    for account, shortcode in wanted:
        success, note = download(account, shortcode, cache)
        print("%-22s %-14s %s" % (account, shortcode, note))
        ok, failed = (ok + 1, failed) if success else (ok, failed + 1)

    print("\n%d Cover geladen, %d fehlgeschlagen." % (ok, failed))
    if failed:
        print("Fehlgeschlagene Cover liegen meist an Instagrams Drosselung — "
              "einfach später erneut ausführen.")
    return 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if args[:1] == ["list"] and len(args) == 2:
        sys.exit(cmd_list(args[1]))
    if args[:1] == ["fetch"]:
        sys.exit(cmd_fetch(args[1] if len(args) > 1 else LIST_FILE))
    if args[:1] == ["avatars"]:
        sys.exit(cmd_avatars(args[1:]))
    print(__doc__.strip())
    sys.exit(2)
