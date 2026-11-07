#!/usr/bin/env bash
#
# Lokale Demo von Nikki Media auf dem eigenen Rechner (Mac).
#
#     cd ~/nikki-demo && git pull && bash scripts/demo-lokal.sh
#
# Danach im Browser: http://localhost:8080  (Dashboards mit Ein-Klick-Login: http://localhost:8080/__vorschau)
# Beenden: Strg+C im Terminal.
#
# Ändert NICHTS an nikkimedia.co: Alles läuft gegen eine eigene Testdatenbank
# (.wrangler/preview-state, nur --local), mit erfundenen Testdaten. Es gehen keine
# Mails raus. Die Fachartikel-Entwürfe aus docs/fachartikel werden NUR in dieser
# Testdatenbank veröffentlicht, damit man sie im Blog ansehen kann.
set -euo pipefail
cd "$(dirname "$0")/.."
STATE=".wrangler/preview-state"
PORT="${PORT:-8080}"

for t in node npm npx python3; do command -v "$t" >/dev/null 2>&1 || { echo "✘ $t fehlt auf diesem Rechner."; exit 1; }; done

echo "▸ 1/4  Pakete prüfen"
npm install --silent --no-audit --no-fund

echo "▸ 2/4  Testdatenbank mit erfundenen Daten anlegen"
python3 tools/preview.py seed

echo "▸ 3/4  Fachartikel-Entwürfe in die Testdatenbank (nur lokal veröffentlicht)"
npx wrangler d1 execute nikki-media --local --persist-to "$STATE" --command "DELETE FROM articles" >/dev/null 2>&1
CI=1 node scripts/fachartikel-import.mjs --local >/dev/null 2>&1
npx wrangler d1 execute nikki-media --local --persist-to "$STATE" --command "UPDATE articles SET published = 1" >/dev/null 2>&1
echo "✓ $(ls docs/fachartikel/[0-9]*.md | wc -l | tr -d ' ') Fachartikel in der Demo"

echo "▸ 4/4  Demo starten"
echo
echo "   Startseite:   http://localhost:$PORT"
echo "   Fachartikel:  http://localhost:$PORT/fachartikel"
echo "   Dashboards:   http://localhost:$PORT/__vorschau   (Ein-Klick-Login je Rolle)"
echo
echo "   Beenden mit Strg+C."
echo
# Browser öffnen, sobald die Demo antwortet (macOS: open).
( for i in $(seq 1 90); do
    if curl -s -o /dev/null "http://localhost:$PORT/__vorschau"; then
      command -v open >/dev/null 2>&1 && open "http://localhost:$PORT/" ; break
    fi; sleep 1
  done ) &
python3 tools/preview.py serve --no-seed --share "$PORT"
