#!/usr/bin/env bash
#
# Holt die echten Vorschaubilder (Cover) von Instagram-Reels und legt sie
# lokal unter public/img/cases/ ab.
#
# Warum lokal statt direkt von Instagram verlinken?
#   Instagram-CDN-URLs sind signiert und laufen nach kurzer Zeit ab. Ein
#   direkt eingebundener Link wäre nach wenigen Tagen ein toter Platzhalter.
#   Einmal heruntergeladen bleiben die Bilder stabil, laden schneller und
#   es fließen beim Seitenaufruf keine Besucherdaten an Meta.
#
# Verwendung:
#   1. In reels.txt eine Zeile pro Reel eintragen:  <account> <shortcode>
#      Den Shortcode findest du in jeder Reel-URL:
#      instagram.com/xyz/reel/DP_uoY6jFCU/  ->  DP_uoY6jFCU
#   2. bash tools/fetch-instagram-thumbs.sh
#   3. Das Skript gibt am Ende die echten Like-Zahlen und Bildpfade aus —
#      diese Werte in public/index.html eintragen.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIST="${1:-$ROOT/tools/reels.txt}"
OUT="$ROOT/public/img/cases"
# Instagram liefert die Open-Graph-Daten nur an Crawler aus:
UA_META="facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"
UA_IMG="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"

mkdir -p "$OUT"
[ -f "$LIST" ] || { echo "Liste nicht gefunden: $LIST"; exit 1; }

ok=0; fail=0
printf '\n%-22s %-14s %-9s %s\n' "ACCOUNT" "SHORTCODE" "LIKES" "DATEI"
printf '%s\n' "--------------------------------------------------------------------------"

while read -r account code _rest; do
  # Leerzeilen und Kommentare überspringen
  [ -z "${account:-}" ] && continue
  case "$account" in \#*) continue ;; esac
  [ -z "${code:-}" ] && continue

  page=$(curl -sL --max-time 30 -A "$UA_META" "https://www.instagram.com/reel/$code/" 2>/dev/null)

  read -r img owner likes caption <<<"$(printf '%s' "$page" | python3 -c '
import sys, re, html, json
s = sys.stdin.read()
def meta(k):
    m = re.search(r"<meta property=\"" + k + r"\" content=\"([^\"]*)\"", s)
    return html.unescape(m.group(1)) if m else ""
img  = meta("og:image")
url  = meta("og:url")
desc = meta("og:description")
title= meta("og:title")
owner = ""
m = re.search(r"instagram\.com/([^/]+)/reel/", url)
if m: owner = m.group(1)
if not owner:
    m = re.search(r"- ([A-Za-z0-9._]+) on ", desc)
    if m: owner = m.group(1)
likes = ""
m = re.search(r"([\d.,]+)\s+likes", desc)
if m: likes = m.group(1).replace(",", "").replace(".", "")
cap = title.split(" on Instagram:", 1)[-1].strip().strip("“”\"")
cap = re.sub(r"\s+", " ", cap)[:90]
print(json.dumps(img), json.dumps(owner), json.dumps(likes or "0"), json.dumps(cap))
' 2>/dev/null)"

  img=$(printf '%s' "$img" | python3 -c 'import sys,json;print(json.load(sys.stdin))' 2>/dev/null)
  owner=$(printf '%s' "$owner" | python3 -c 'import sys,json;print(json.load(sys.stdin))' 2>/dev/null)
  likes=$(printf '%s' "$likes" | python3 -c 'import sys,json;print(json.load(sys.stdin))' 2>/dev/null)

  if [ -z "$img" ]; then
    printf '%-22s %-14s %-9s %s\n' "$account" "$code" "-" "FEHLER: kein og:image (Reel privat/gelöscht?)"
    fail=$((fail+1)); sleep 4; continue
  fi

  # Sicherheitsnetz: gehört der Beitrag wirklich dem erwarteten Account?
  if [ -n "$owner" ] && [ "$owner" != "$account" ]; then
    printf '%-22s %-14s %-9s %s\n' "$account" "$code" "-" "ÜBERSPRUNGEN: gehört zu @$owner, nicht @$account"
    fail=$((fail+1)); sleep 4; continue
  fi

  file="$OUT/$account-$code.jpg"
  if curl -sL --max-time 45 -A "$UA_IMG" "$img" -o "$file" && [ -s "$file" ] \
     && file -b "$file" | grep -qi jpeg; then
    printf '%-22s %-14s %-9s %s\n' "$account" "$code" "$likes" "img/cases/$(basename "$file")"
    printf '   „%s"\n' "$caption"
    ok=$((ok+1))
  else
    rm -f "$file"
    printf '%-22s %-14s %-9s %s\n' "$account" "$code" "-" "FEHLER: Download fehlgeschlagen"
    fail=$((fail+1))
  fi

  sleep 4   # Instagram drosselt schnelle Abfragen
done < "$LIST"

printf '\n%d Cover geladen, %d fehlgeschlagen.\n' "$ok" "$fail"
