#!/usr/bin/env python3
"""
Lokale Vorschau aller Bereiche von Nikki Media, mit Testdaten und Screenshots.

Warum es dieses Werkzeug gibt
  Die Dashboards (Admin, Kunde, Clipper, Creator, Agentur) sieht man nur mit
  Daten darin. Live-Daten kommen dafür nicht in Frage. Dieses Skript baut eine
  EIGENE lokale Datenbank (.wrangler/preview-state), füllt sie mit
  realistischen, erfundenen Daten, startet `wrangler dev` dagegen und
  fotografiert jede Seite je Rolle. Am Live-System und an der normalen
  Entwicklungsdatenbank ändert es nichts.

  Angemeldet wird ohne Mail und ohne Passwort: das Skript legt Sitzungen
  direkt in die Tabelle `sessions`, mit demselben Hash wie src/lib/auth.ts
  (HMAC-SHA256 über "session:<token>" mit AUTH_SECRET).

Verwendung
  python3 tools/preview.py seed                 Datenbank neu aufbauen + füllen
  python3 tools/preview.py serve                Worker starten (Strg+C beendet)
  python3 tools/preview.py serve --share 8080   dazu klickbar mit Ein-Klick-Login: /__vorschau
  python3 tools/preview.py shoot [ordner]       seed + serve + Screenshots aller Seiten
  python3 tools/preview.py shoot ordner --only admin,clipper --mobile

Voraussetzung: `npm ci` und `pip install playwright`. Chromium wird nicht
heruntergeladen; ist PLAYWRIGHT_CHROMIUM gesetzt (oder /opt/pw-browsers/chromium
vorhanden), wird dieser Browser benutzt.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import os
import random
import secrets
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / ".wrangler" / "preview-state"
SECRET = "preview-pepper"
PORT = int(os.environ.get("PREVIEW_PORT", "8799"))
BASE = f"http://127.0.0.1:{PORT}"
NOW = int(time.time())
DAY = 86400

rnd = random.Random(42)  # gleiche Daten bei jedem Lauf


# --------------------------------------------------------------------- Helfer


def q(value: object) -> str:
    """SQL-Literal. Nur für Testdaten aus diesem Skript, nie für Eingaben von außen."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return str(int(value))
    return "'" + str(value).replace("'", "''") + "'"


def insert(table: str, row: dict) -> str:
    cols = ", ".join(row)
    vals = ", ".join(q(v) for v in row.values())
    return f"INSERT INTO {table} ({cols}) VALUES ({vals});"


def uid() -> str:
    return uuid.UUID(int=rnd.getrandbits(128)).hex


def wrangler(*args: str, check: bool = True) -> subprocess.CompletedProcess:
    return subprocess.run(["npx", "wrangler", *args], cwd=ROOT, capture_output=True, text=True, check=check)


def token_hash(token: str) -> str:
    return hmac.new(SECRET.encode(), f"session:{token}".encode(), hashlib.sha256).hexdigest()


# ---------------------------------------------------------------- Testdaten


PLATFORMS = ["tiktok", "instagram", "youtube"]
CLIPPERS = ["Lena Hofer", "Jonas Berger", "Mia Wagner", "Luca Steiner", "Emma Gruber", "Noah Huber", "Sophie Bauer", "Elias Pichler"]
CREATORS = [("Max Tornow", "Business"), ("Dina Drop", "Lifestyle"), ("Kaan Yilmaz", "Fitness")]
CAMPAIGNS = [
    ("Panperium Bakery Launch", 2_000_000, 1_000_000, "Food"),
    ("Caspian Caviar Herbst", 1_000_000, 500_000, "Luxus"),
    ("Levantine Istanbul Reels", 5_000_000, 2_500_000, "Gastronomie"),
    ("Tornow Business Podcast", 1_000_000, 500_000, "Business"),
]

# Wer sich anmeldet. Rolle -> (user_id, Name, E-Mail)
ACCOUNTS = {
    "admin": ("u-admin", "Jason Azarov", "admin@preview.local"),
    "customer": ("u-kunde", "Pan Perium", "kunde@preview.local"),
    "clipper": ("u-clip-0", CLIPPERS[0], "clipper0@preview.local"),
    "creator": ("u-creator-0", CREATORS[0][0], "creator0@preview.local"),
    "agency": ("u-agency", "Sarah Klein", "agentur@preview.local"),
}


def seed_sql() -> tuple[str, dict[str, str]]:
    out: list[str] = []
    tokens: dict[str, str] = {}

    def user(uid_: str, role: str, name: str, email: str, **extra) -> None:
        out.append(insert("users", {"id": uid_, "email": email, "role": role, "full_name": name,
                                    "verified_at": NOW - 40 * DAY, "created_at": NOW - 40 * DAY, **extra}))

    # Admin, Kunde, Agentur
    user("u-admin", "admin", "Jason Azarov", "admin@preview.local")
    user("u-kunde", "customer", "Pan Perium", "kunde@preview.local", phone="+43 660 1234567")
    out.append(insert("customers", {"id": "cu-1", "user_id": "u-kunde", "company": "Panperium GmbH",
                                    "storage_bytes": 38_000_000_000, "converted_at": NOW - 30 * DAY, "created_at": NOW - 40 * DAY}))
    user("u-agency", "agency", "Sarah Klein", "agentur@preview.local")
    out.append(insert("customers", {"id": "cu-ag", "user_id": "u-agency", "company": "Klein & Partner Media",
                                    "converted_at": NOW - 20 * DAY, "margin_pct": 30, "created_at": NOW - 25 * DAY}))
    out.append(insert("agency_leads", {
        "id": "al-1", "user_id": "u-agency", "customer_id": "cu-ag", "company": "Klein & Partner Media", "kind": "Marketing-Agentur",
        "has_clients": "mehrere", "platforms": '["tiktok","instagram"]', "source": "LinkedIn", "niche": "Food", "socials": '{"instagram":"kleinpartner"}',
        "footage": "ja", "warm": 1, "access_at": NOW - 20 * DAY, "views_target": 2_000_000, "budget_cents": 1_000_000,
        "package": "2 Mio. Views", "briefed_at": NOW - 20 * DAY, "created_at": NOW - 25 * DAY}))

    # Clipper
    clipper_ids = []
    for i, name in enumerate(CLIPPERS):
        u = f"u-clip-{i}"
        user(u, "clipper", name, f"clipper{i}@preview.local")
        cid = f"c-{i}"
        clipper_ids.append(cid)
        out.append(insert("clippers", {"id": cid, "user_id": u, "display_name": name, "status": "aktiv" if i < 6 else "eingeladen",
                                       "created_at": NOW - (35 - i) * DAY}))
        out.append(insert("clipper_applications", {"id": f"ca-{i}", "clipper_id": cid, "platforms": '["tiktok","instagram"]',
                                                   "work_status": "Student", "experience": "1-2 Jahre", "availability": "20 h/Woche",
                                                   "created_at": NOW - (35 - i) * DAY}))
    for j, (views, cents) in enumerate([(10_000, 2_000), (100_000, 25_000), (500_000, 150_000), (1_000_000, 350_000)]):
        out.append(insert("pay_tiers", {"id": f"pt-{j}", "user_id": "u-clip-0", "min_views": views, "amount_cents": cents, "created_at": NOW}))

    # Creator
    creator_ids = []
    for i, (name, niche) in enumerate(CREATORS):
        u = f"u-creator-{i}"
        user(u, "creator", name, f"creator{i}@preview.local")
        crid = f"cr-{i}"
        creator_ids.append(crid)
        out.append(insert("creators", {"id": crid, "user_id": u, "goal": "Reichweite", "niche": niche, "platforms": '["tiktok","instagram"]',
                                       "open_to_ads": "ja", "followers": "50.000-100.000", "views_total": "10 Mio.",
                                       "views_30d": "1 Mio.", "handles": '{"instagram":"' + name.split()[0].lower() + '"}', "created_at": NOW - 30 * DAY}))
        out.append(insert("customers", {"id": f"cu-cr-{i}", "user_id": u, "company": None, "created_at": NOW - 30 * DAY}))
        # Creator schneiden auch: ihr Bereich braucht zusätzlich einen Clipper-Datensatz (routes/campaigns.ts → areaOf)
        out.append(insert("clippers", {"id": f"c-cr-{i}", "user_id": u, "display_name": name, "status": "aktiv", "created_at": NOW - 30 * DAY}))

    # Kampagnen: drei vom Kunden, eine eigene des Creators, eine der Agentur
    owners = ["cu-1", "cu-1", "cu-1", "cu-cr-0", "cu-ag"]
    projects = []
    for i, (name, views, cents, niche) in enumerate(CAMPAIGNS + [("Klein & Partner: Bäckerei Mayer", 2_000_000, 1_000_000, "Food")]):
        pid = f"p-{i}"
        projects.append(pid)
        out.append(insert("projects", {
            "id": pid, "customer_id": owners[i], "name": name, "status": "aktiv" if i != 2 else "abgeschlossen",
            "creator_distribution": 1 if i in (0, 2) else 0, "briefing_views": views, "briefing_budget_cents": cents,
            "briefing_package": f"{views // 1_000_000} Mio. Views" if views >= 1_000_000 else None, "briefing_niche": niche,
            "briefing_platforms": '["tiktok","instagram","youtube"]', "created_at": NOW - (30 - 4 * i) * DAY}))
        out.append(insert("folders", {"id": f"f-{i}", "customer_id": owners[i], "project_id": pid, "name": "Rohmaterial", "created_at": NOW - 29 * DAY}))
        for k in range(3):
            out.append(insert("raw_assets", {"id": f"ra-{i}-{k}", "folder_id": f"f-{i}", "r2_key": f"preview/raw-{i}-{k}.mp4",
                                             "filename": f"Rohmaterial_{k + 1:02d}.mp4", "bytes": 800_000_000, "mime": "video/mp4",
                                             "upload_status": "complete", "created_at": NOW - 28 * DAY}))
        out.append(insert("project_links", {"id": f"pl-{i}", "project_id": pid, "url": "https://drive.google.com/drive/folders/preview",
                                            "added_by": "u-admin", "created_at": NOW - 28 * DAY}))
        team = clipper_ids[i % 3: i % 3 + 3]
        for cid in team:
            out.append(insert("project_workers", {"project_id": pid, "clipper_id": cid, "assigned_at": NOW - 27 * DAY, "notified_at": NOW - 27 * DAY}))
        if i in (0, 2):
            out.append(insert("campaign_creators", {"project_id": pid, "creator_id": "cr-0", "joined_at": NOW - 20 * DAY}))

        # Fertige Clips mit Zahlen
        for d in range(6 if i != 4 else 3):
            did = f"d-{i}-{d}"
            cid = team[d % len(team)]
            published = NOW - rnd.randint(1, 26) * DAY
            out.append(insert("deliverables", {
                "id": did, "project_id": pid, "clipper_id": cid, "r2_key": f"preview/clip-{i}-{d}.mp4", "filename": f"Clip_{d + 1:02d}.mp4",
                "caption": "Das musst du sehen 👀", "bytes": 40_000_000, "upload_status": "complete", "seen_by_customer": d % 2,
                "publish_status": "veroeffentlicht" if d < 5 else "fehler", "created_at": published - 3600}))
            if d >= 5:
                continue
            for p, plat in enumerate(PLATFORMS):
                post = f"post-{i}-{d}-{p}"
                views_n = int(rnd.lognormvariate(10.8, 1.1))
                out.append(insert("post_metrics", {
                    "post_id": post, "account_id": f"acc-{plat}-{i}", "deliverable_id": did, "project_id": pid, "platform": plat,
                    "username": f"{name.split()[0].lower()}.{plat}", "url": f"https://www.{plat}.com/p/{post}", "views": views_n,
                    "likes": views_n // 18, "comments": views_n // 400, "shares": views_n // 250, "saves": views_n // 300,
                    "synced_at": NOW - 900}))
                out.append(insert("metrics_sync", {"post_id": post, "deliverable_id": did, "project_id": pid, "platform": plat,
                                                   "published_at": published, "status": "ok", "next_at": NOW + 3600, "tries": 1, "last_at": NOW - 900}))

    out.append(insert("creator_bookings", {"id": "cb-1", "agency_user_id": "u-agency", "creator_id": "cr-1", "project_id": "p-4",
                                            "message": "Passt perfekt zur Zielgruppe.", "status": "angefragt", "created_at": NOW - 2 * DAY}))

    # Leads
    for i, (name, company, industry, budget) in enumerate([
        ("Thomas Leitner", "Leitner Immobilien", "Immobilien", "5.000-10.000 €"),
        ("Anna Schmid", "Schmid Kosmetik", "Beauty", "2.500-5.000 €"),
        ("Patrick Moser", "Moser Fitness", "Fitness", "über 10.000 €"),
        ("Julia Weber", None, "Coaching", "1.000-2.500 €"),
        ("Florian Koch", "Koch Autohaus", "Automobil", "5.000-10.000 €"),
    ]):
        out.append(insert("leads", {"id": f"l-{i}", "full_name": name, "company": company, "email": f"lead{i}@preview.local",
                                    "phone": "+43 660 000000" + str(i), "platforms": '["tiktok","instagram"]', "industry": industry,
                                    "footage_amount": "10-50 Videos", "budget_range": budget, "status": ["neu", "neu", "kontaktiert", "gewonnen", "neu"][i],
                                    "created_at": NOW - i * DAY - 3600}))

    out.append(insert("cooperation_codes", {"id": "cc-1", "code": "NM7K2Q", "note": "Messe Wien", "created_by": "u-admin", "created_at": NOW - 3 * DAY}))
    out.append(insert("upsell_requests", {"id": "up-1", "project_id": "p-0", "user_id": "u-kunde", "percent": 25, "base_views": 2_000_000,
                                          "extra_views": 500_000, "price_cents": 250_000, "status": "offen", "created_at": NOW - DAY}))

    articles = [
        ("was-ist-clipping", "Was ist Clipping? Der Leitfaden für Marken im DACH-Raum",
         "Clipping verwandelt langes Videomaterial in Hunderte kurze Clips. Wie das Modell funktioniert, was 1 Mio. Views kostet und worauf Marken achten sollten."),
        ("clipping-agentur-vergleich", "Clipping-Agentur finden: 7 Kriterien, die wirklich zählen",
         "Abrechnung pro View, echte Zahlen aus den Plattformen, geprüfte Clipper: So vergleichst du Clipping-Agenturen in Deutschland, Österreich und der Schweiz."),
        ("cpm-organische-reichweite", "CPM bei organischer Reichweite: warum 5 € je 1.000 Views günstig sind",
         "Ein Vergleich mit Paid Social: Was organische Views über Clipper kosten und warum die Reichweite länger trägt."),
    ]
    body = ("Clipping ist ...\n\n## Wie funktioniert Clipping?\n\nEin Netzwerk aus Clippern schneidet dein Material.\n\n"
            "- Rohmaterial hochladen\n- Clipper schneiden\n- Views werden gezählt\n\n## Was kostet es?\n\n1 Mio. Views kosten 5.000 €.")
    for i, (slug, title, excerpt) in enumerate(articles):
        out.append(insert("articles", {"id": f"a-{i}", "slug": slug, "title": title, "excerpt": excerpt, "body": body,
                                       "author": "Jason Azarov", "published": 1, "published_at": NOW - (i * 7 + 1) * DAY,
                                       "created_at": NOW - (i * 7 + 1) * DAY, "updated_at": NOW - i * DAY}))

    for i, (action, entity) in enumerate([("project.create", "project"), ("deliverable.upload", "deliverable"), ("lead.create", "lead"),
                                          ("clipper.assign", "project"), ("login.success.code", "user")]):
        out.append(insert("audit_log", {"id": f"au-{i}", "actor_id": "u-admin", "action": action, "entity": entity,
                                        "entity_id": "p-0", "created_at": NOW - i * 3600}))

    # Sitzungen
    for role, (user_id, _, _) in ACCOUNTS.items():
        token = secrets.token_hex(24)
        tokens[role] = token
        out.append(insert("sessions", {"id": f"s-{role}", "user_id": user_id, "token_hash": token_hash(token),
                                       "expires_at": NOW + 7 * DAY, "created_at": NOW}))
    return "\n".join(out), tokens


def seed() -> dict[str, str]:
    shutil.rmtree(STATE, ignore_errors=True)
    run = wrangler("d1", "migrations", "apply", "nikki-media", "--local", "--persist-to", str(STATE), check=False)
    if run.returncode != 0:
        sys.exit(f"Migrationen fehlgeschlagen:\n{run.stdout}\n{run.stderr}")
    sql, tokens = seed_sql()
    seed_file = STATE / "seed.sql"
    seed_file.write_text(sql, encoding="utf-8")
    run = wrangler("d1", "execute", "nikki-media", "--local", "--persist-to", str(STATE), "--file", str(seed_file), "--yes", check=False)
    if run.returncode != 0:
        sys.exit(f"Testdaten fehlgeschlagen:\n{run.stdout[-3000:]}\n{run.stderr[-3000:]}")
    (STATE / "tokens.txt").write_text("\n".join(f"{k}={v}" for k, v in tokens.items()), encoding="utf-8")
    print(f"✓ Datenbank gefüllt ({sql.count('INSERT')} Zeilen) in {STATE.relative_to(ROOT)}")
    return tokens


def read_tokens() -> dict[str, str]:
    lines = (STATE / "tokens.txt").read_text(encoding="utf-8").splitlines()
    return dict(line.split("=", 1) for line in lines if "=" in line)


# -------------------------------------------------------------------- Server


def port_open() -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", PORT)) == 0


def start_server() -> subprocess.Popen:
    global PORT, BASE
    if port_open():
        # Belegt, meist von einem früheren Lauf: einfach einen freien Port nehmen statt abzubrechen.
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            PORT = sock.getsockname()[1]
        BASE = f"http://127.0.0.1:{PORT}"
        print(f"• Port 8799 belegt (alter Lauf?), nehme Port {PORT}")
    proc = subprocess.Popen(
        ["npx", "wrangler", "dev", "--local", "--port", str(PORT), "--persist-to", str(STATE),
         "--var", f"AUTH_SECRET:{SECRET}", "--show-interactive-dev-session=false"],
        cwd=ROOT, stdout=(STATE / "worker.log").open("w"), stderr=subprocess.STDOUT, start_new_session=True)
    for _ in range(120):
        try:
            with urllib.request.urlopen(f"{BASE}/login", timeout=2) as res:
                if res.status == 200:
                    print(f"✓ Worker läuft auf {BASE}")
                    return proc
        except Exception:
            time.sleep(0.5)
    stop_server(proc)
    log = (STATE / "worker.log").read_text(errors="replace")[-2500:] if (STATE / "worker.log").exists() else ""
    sys.exit(f"✘ Worker kam nicht hoch. Letzte Zeilen aus .wrangler/preview-state/worker.log:\n{log}")


def stop_server(proc: subprocess.Popen) -> None:
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass


# --------------------------------------------------------------- Screenshots


PAGES: dict[str | None, list[str]] = {
    None: ["/", "/clipper", "/creator", "/brands", "/agenturen", "/personal-brands", "/investoren", "/fachartikel",
           "/fachartikel/was-ist-clipping", "/login"],
    "admin": ["/admin", "/admin/analytics", "/admin/projekte", "/admin/projekte/p-0", "/admin/clipper", "/admin/creator",
              "/admin/kunden", "/admin/leads", "/admin/agenturen", "/admin/fachartikel", "/admin/fachartikel/a-0", "/admin/upsells"],
    "customer": ["/app", "/app/projekt/p-0", "/app/videos", "/app/einstellungen"],
    "clipper": ["/work", "/work/projekt/p-0", "/work/upload"],
    "creator": ["/kampagnen", "/kampagnen/meine", "/kampagnen/finden", "/kampagnen/verbreiten", "/kampagnen/upload", "/kampagnen/accounts"],
    "agency": ["/collaboration", "/collaboration/preise", "/collaboration/neu"],
}


def browser_path() -> str | None:
    env = os.environ.get("PLAYWRIGHT_CHROMIUM")
    if env:
        return env
    default = Path("/opt/pw-browsers/chromium")
    return str(default) if default.exists() else None


def shoot(out_dir: Path, only: set[str] | None, mobile: bool) -> int:
    from playwright.sync_api import sync_playwright

    tokens = read_tokens()
    out_dir.mkdir(parents=True, exist_ok=True)
    problems = 0
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=browser_path())
        for role, paths in PAGES.items():
            key = role or "public"
            if only and key not in only:
                continue
            ctx = browser.new_context(viewport={"width": 390, "height": 844} if mobile else {"width": 1440, "height": 900},
                                      device_scale_factor=1)
            if role:
                ctx.add_cookies([{"name": f"nm_session_{role}", "value": tokens[role], "url": BASE}])
            page = ctx.new_page()
            errors: list[str] = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.on("console", lambda m: errors.append(m.text) if m.type == "error" and "Failed to load resource" not in m.text else None)
            for path in paths:
                errors.clear()
                res = page.goto(BASE + path, wait_until="networkidle")
                page.wait_for_timeout(400)
                name = (key + path.replace("/", "_")).rstrip("_") + (".m" if mobile else "") + ".png"
                page.screenshot(path=str(out_dir / name), full_page=True)
                status = res.status if res else 0
                overflow = page.evaluate("document.documentElement.scrollWidth > window.innerWidth + 1")
                flag = "" if status == 200 and not errors and not overflow else "  ⚠"
                if flag:
                    problems += 1
                print(f"  {status} {key:9} {path:34} {'Querscrollen! ' if overflow else ''}{'; '.join(errors)[:160]}{flag}")
            ctx.close()
        browser.close()
    print(f"✓ Screenshots in {out_dir}")
    return problems



# ------------------------------------------------------ Freigabe zum Klicken


ROLE_CARDS = [
    ("admin", "Administration", "/admin", "Übersicht, Kampagnen, Clipper, Creator, Leads, Agenturen, Fachartikel-Editor"),
    ("customer", "Kunde", "/app", "Kampagnen, fertige Videos, Mehr Reichweite"),
    ("clipper", "Clipper", "/work", "Preisstaffelung, zugeordnete Kampagnen, Videos hochladen"),
    ("creator", "Creator", "/kampagnen", "Eigene und zugewiesene Kampagnen, Verbreiten"),
    ("agency", "Agentur", "/collaboration", "Marktplatz mit Kampagnen, Creatorn und Clippern, Preise & Marge"),
]


def start_page() -> bytes:
    cards = "".join(
        f'<a class="c" href="/__vorschau/{r}"><b>{label}</b><span>{hint}</span><i>Als {label} öffnen →</i></a>'
        for r, label, _, hint in ROLE_CARDS
    )
    pub = "".join(f'<a class="l" href="{u}">{t}</a>' for u, t in [
        ("/", "Startseite"), ("/agenturen", "Für Agenturen"), ("/personal-brands", "Personal Brands"), ("/investoren", "Investoren"),
        ("/clipper", "Clipper werden"), ("/creator", "Creator werden"), ("/brands", "Brands"), ("/fachartikel", "Blog / Fachartikel"),
        ("/fachartikel/was-ist-clipping", "Beispielartikel"), ("/login", "Login-Seite")])
    return f"""<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Nikki Media Vorschau</title><style>
body{{margin:0;background:#000;color:#eef7f1;font:15px/1.5 system-ui,sans-serif;padding:32px max(16px,4vw)}}
h1{{font-size:28px;margin:0}} p{{color:#a3b8ac;max-width:70ch}} h2{{font-size:16px;margin:32px 0 12px;color:#9cf6c8}}
.g{{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}}
.c{{display:flex;flex-direction:column;gap:6px;padding:18px;border-radius:16px;background:#070d0a;border:1px solid rgba(255,255,255,.1);color:inherit;text-decoration:none}}
.c:hover{{border-color:#2fe08c}} .c b{{font-size:18px}} .c span{{color:#a3b8ac;font-size:13px}} .c i{{font-style:normal;color:#2fe08c;font-weight:600;margin-top:auto}}
.l{{display:inline-block;margin:0 8px 8px 0;padding:8px 14px;border-radius:99px;border:1px solid rgba(255,255,255,.14);color:#eef7f1;text-decoration:none}}
.l:hover{{border-color:#2fe08c}} code{{color:#9cf6c8}}</style></head><body>
<h1>Nikki Media · lokale Vorschau</h1>
<p>Alle Daten sind erfundene Testdaten in einer eigenen Datenbank. Klick eine Rolle an, du bist sofort eingeloggt.
Zurück hierher kommst du jederzeit über <code>/__vorschau</code>. Mails werden nicht verschickt.</p>
<h2>Dashboards</h2><div class="g">{cards}</div>
<h2>Öffentliche Seiten</h2><div>{pub}</div></body></html>""".encode()


def share(listen_port: int) -> None:
    """
    Kleiner Proxy vor dem Worker, damit die Vorschau von außen klickbar ist:
      - setzt den Host auf 127.0.0.1 (sonst leitet src/index.ts auf nikkimedia.co um)
      - /__vorschau: Startseite mit Ein-Klick-Login je Rolle (setzt nm_session_<rolle>)
    Am App-Code ändert sich nichts.
    """
    import http.client
    from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

    tokens = read_tokens()
    hop = {"connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate"}

    class H(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *a):
            pass

        def _send(self, code: int, body: bytes, headers: list[tuple[str, str]]):
            self.send_response(code)
            for k, v in headers:
                self.send_header(k, v)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)

        def handle_one(self):
            path = self.path
            if path.rstrip("/") == "/__vorschau":
                return self._send(200, start_page(), [("Content-Type", "text/html; charset=utf-8"), ("Cache-Control", "no-store")])
            if path.startswith("/__vorschau/"):
                role = path.split("/")[2]
                home = dict((r, h) for r, _, h, _ in ROLE_CARDS).get(role)
                if not home or role not in tokens:
                    return self._send(404, b"Unbekannte Rolle", [("Content-Type", "text/plain; charset=utf-8")])
                return self._send(302, b"", [("Location", home),
                                             ("Set-Cookie", f"nm_session_{role}={tokens[role]}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800")])
            length = int(self.headers.get("Content-Length") or 0)
            data = self.rfile.read(length) if length else None
            headers = {k: v for k, v in self.headers.items() if k.lower() not in hop and k.lower() != "host"}
            headers["Host"] = f"127.0.0.1:{PORT}"
            headers.pop("Accept-Encoding", None)
            conn = http.client.HTTPConnection("127.0.0.1", PORT, timeout=120)
            try:
                conn.request(self.command, path, body=data, headers=headers)
                res = conn.getresponse()
                body = res.read()
            except Exception as e:  # Worker lädt gerade neu
                return self._send(502, f"Worker nicht erreichbar: {e}".encode(), [("Content-Type", "text/plain; charset=utf-8")])
            finally:
                conn.close()
            out = []
            for k, v in res.getheaders():
                if k.lower() in hop or k.lower() == "content-length":
                    continue
                if k.lower() == "location":
                    v = v.replace(f"http://127.0.0.1:{PORT}", "").replace(f"http://localhost:{PORT}", "") or "/"
                if k.lower() == "set-cookie":
                    v = v.replace("; Secure", "")  # Vorschau läuft evtl. ohne HTTPS
                out.append((k, v))
            self._send(res.status, body, out)

        do_GET = do_POST = do_PUT = do_DELETE = do_PATCH = do_HEAD = do_OPTIONS = handle_one

    try:
        srv = ThreadingHTTPServer(("0.0.0.0", listen_port), H)
    except OSError:
        srv = ThreadingHTTPServer(("0.0.0.0", 0), H)
        listen_port = srv.server_address[1]
        print(f"• Port für die Vorschau war belegt, nehme Port {listen_port}")
    print(f"✓ Vorschau zum Klicken: http://localhost:{listen_port}/__vorschau")
    srv.serve_forever()


# ---------------------------------------------------------------------- Main


def check_tools() -> None:
    """Vorab prüfen, was die Vorschau braucht, und klar sagen, was fehlt."""
    if sys.version_info < (3, 9):
        sys.exit(f"✘ Python {sys.version.split()[0]} ist zu alt. Bitte Python 3.9 oder neuer installieren (python.org).")
    node = shutil.which("node")
    if not node:
        sys.exit("✘ Node.js fehlt. Bitte die LTS-Version von nodejs.org installieren und das Terminal neu öffnen.")
    ver = subprocess.run([node, "-v"], capture_output=True, text=True).stdout.strip()
    if int(ver.lstrip("v").split(".")[0] or 0) < 20:
        sys.exit(f"✘ Node.js {ver} ist zu alt. Bitte die LTS-Version (20 oder neuer) von nodejs.org installieren.")
    if not (ROOT / "node_modules" / "wrangler").exists():
        sys.exit("✘ Abhängigkeiten fehlen. Bitte zuerst im Ordner des Projekts ausführen:  npm ci")
    print(f"✓ Python {sys.version.split()[0]}, Node.js {ver}, Abhängigkeiten vorhanden")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("cmd", choices=["seed", "serve", "shoot"])
    ap.add_argument("out", nargs="?", default=str(ROOT / ".wrangler" / "screens"))
    ap.add_argument("--only", help="Kommagetrennt: public,admin,customer,clipper,creator,agency")
    ap.add_argument("--mobile", action="store_true", help="Handy-Breite 390 px")
    ap.add_argument("--no-seed", action="store_true", help="Vorhandene Vorschau-Datenbank benutzen")
    ap.add_argument("--share", type=int, metavar="PORT", help="serve: zusätzlich klickbar freigeben (Proxy mit /__vorschau)")
    args = ap.parse_args()

    check_tools()
    if args.cmd == "seed":
        seed()
        return
    if not args.no_seed or not (STATE / "tokens.txt").exists():
        seed()
    proc = start_server()
    try:
        if args.cmd == "serve":
            print("Sitzungen (Cookie nm_session_<rolle>):")
            for role, token in read_tokens().items():
                print(f"  {role:9} {token}")
            if args.share:
                share(args.share)
            else:
                proc.wait()
        else:
            problems = shoot(Path(args.out), set(args.only.split(",")) if args.only else None, args.mobile)
            sys.exit(1 if problems else 0)
    except KeyboardInterrupt:
        pass
    finally:
        stop_server(proc)


if __name__ == "__main__":
    main()
