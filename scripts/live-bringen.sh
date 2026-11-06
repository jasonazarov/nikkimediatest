#!/usr/bin/env bash
#
# live-bringen: überträgt den Stand dieses Ordners (der Demo) in das Live-Repo
# adprimesbrand-gif/nikki-media und stellt ihn auf nikkimedia.co live.
#
#     cd ~/nikki-demo && git pull && bash scripts/live-bringen.sh
#
# Hält bei jedem Fehler sofort an und fragt vor dem Hochladen einmal nach.
# Übertragen werden nur Dateien, die in Git stehen (keine lokalen Testdaten,
# keine Zugangsdateien). Die Historie des Live-Repos bleibt erhalten, es wird
# nichts überschrieben, was nicht ersetzt werden soll.
# Läuft mit der bash von macOS (3.2).

set -euo pipefail

LIVE_REPO="${LIVE_REPO:-https://github.com/adprimesbrand-gif/nikki-media.git}"
LIVE_DIR="${LIVE_DIR:-$HOME/nikki-live}"
DEMO_DIR="$(cd "$(dirname "$0")/.." && pwd)"

B=$'\033[1m'; R=$'\033[31m'; G=$'\033[32m'; Y=$'\033[33m'; O=$'\033[0m'
step () { printf '\n%s▸ %s%s\n' "$B" "$1" "$O"; }
ok   () { printf '%s✓ %s%s\n' "$G" "$1" "$O"; }
fail () { printf '\n%s✘ %s%s\n\nNichts weiter passiert. Schick einen Screenshot davon.\n' "$R" "$1" "$O" >&2; exit 1; }

# ------------------------------------------------------------------ Werkzeuge
step "1/7  Werkzeuge prüfen"
for t in git node npm npx tar; do
  command -v "$t" >/dev/null 2>&1 || fail "$t fehlt auf diesem Rechner."
done
ok "git, node, npm vorhanden"

# ------------------------------------------------------------------- Demo
step "2/7  Neuen Stand prüfen ($DEMO_DIR)"
cd "$DEMO_DIR"
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "Im Demo-Ordner gibt es ungespeicherte Änderungen an Dateien. Erst klären, dann neu starten."
git pull -q || fail "git pull im Demo-Ordner ging nicht."
NEW="$(git rev-parse --short HEAD)"
grep -q 'name = "nikki-media"' wrangler.toml || fail "wrangler.toml im neuen Stand trägt nicht den Worker-Namen nikki-media."
ok "Neuer Stand: $NEW"

# ------------------------------------------------------------------- Live-Repo
step "3/7  Live-Repo holen ($LIVE_DIR)"
if [ -d "$LIVE_DIR/.git" ]; then
  cd "$LIVE_DIR"
  [ -z "$(git status --porcelain)" ] || fail "In $LIVE_DIR gibt es ungespeicherte Änderungen. Den Ordner prüfen oder umbenennen, dann neu starten."
  git checkout -q main || fail "Branch main fehlt in $LIVE_DIR."
  git pull -q origin main || fail "git pull im Live-Repo ging nicht (Anmeldung bei GitHub?)."
else
  [ ! -e "$LIVE_DIR" ] || fail "$LIVE_DIR existiert, ist aber kein Git-Ordner. Umbenennen, dann neu starten."
  git clone -q "$LIVE_REPO" "$LIVE_DIR" || fail "Klonen ging nicht. Bist du bei GitHub mit einem Konto angemeldet, das nikki-media sieht?"
  cd "$LIVE_DIR"
  git checkout -q main || fail "Branch main fehlt im Live-Repo."
fi
ok "Live-Repo auf main, Stand $(git rev-parse --short HEAD)"

# --------------------------------------------------------------- Übertragen
step "4/7  Neuen Stand übertragen"
# Nur Dateien, die Git kennt, ersetzen. node_modules, .wrangler und .dev.vars
# stehen nicht in Git und bleiben deshalb unberührt.
# Alle bisher verfolgten Dateien entfernen, dann den neuen Stand auspacken.
git ls-tree -r -z --name-only HEAD | xargs -0 rm -f
git -C "$DEMO_DIR" archive --format=tar HEAD | tar -x -C "$LIVE_DIR"
git add -A
[ -n "$(git status --porcelain)" ] || { ok "Live-Repo ist schon auf diesem Stand, nichts zu übertragen."; NOTHING=1; }
grep -q 'name = "nikki-media"' wrangler.toml || fail "Nach dem Übertragen fehlt der Worker-Name in wrangler.toml."
CHANGED="$(git status --porcelain | wc -l | tr -d ' ')"
REMOVED="$(git status --porcelain | grep -c '^D' || true)"
ok "$CHANGED Dateien geändert, davon $REMOVED entfernt"

# ------------------------------------------------------------------ Hochladen
if [ -z "${NOTHING:-}" ]; then
  step "5/7  Auf GitHub hochladen"
  printf '%sJetzt wird der neue Stand auf github.com/adprimesbrand-gif/nikki-media (main) hochgeladen.%s\n' "$Y" "$O"
  printf 'Weiter? (j/n) '; read -r a
  case "$a" in j|J|y|Y|ja|Ja) ;; *) git reset -q --hard; fail "Abgebrochen, nichts hochgeladen.";; esac
  git commit -qm "Neues Design: Liquid Glass Grün, Whop-Dashboards, SEO/GEO, Blog, Hintergrundlicht (Stand $NEW)"
  git push -q origin main || fail "Hochladen ging nicht (Anmeldung bei GitHub?). Lokal ist alles gespeichert, Skript einfach neu starten."
  ok "Auf GitHub: $(git rev-parse --short HEAD)"
else
  step "5/7  Hochladen nicht nötig"
fi

# ------------------------------------------------------------------ Cloudflare
step "6/7  Cloudflare vorbereiten"
npm install --silent --no-audit --no-fund || fail "npm install ging nicht."
if ! npx wrangler whoami 2>/dev/null | grep -q c80a29b391c87cab55592199b80c7663; then
  printf 'Es öffnet sich gleich der Browser: dort bei Cloudflare anmelden und „Allow“ klicken.\n'
  npx wrangler login || fail "Anmeldung bei Cloudflare ging nicht."
  npx wrangler whoami 2>/dev/null | grep -q c80a29b391c87cab55592199b80c7663 || fail "Angemeldet, aber nicht im Cloudflare-Konto von Nikki Media."
fi
ok "Bei Cloudflare angemeldet"
# Fehlende Datenbank-Änderungen ZUERST, sonst fragt der neue Code Spalten ab,
# die live noch fehlen. Spielt nur Fehlendes ein, löscht keine Daten.
CI=1 npx wrangler d1 migrations apply nikki-media --remote || fail "Datenbank-Änderungen ließen sich nicht einspielen. Es wurde NICHT deployt."
ok "Datenbank auf dem neuen Stand"

# ---------------------------------------------------------------------- Live
step "7/7  Prüfen und live stellen"
printf 'Hinweis: eine rote Zeile „Authentication error [code: 10000]“ ist harmlos.\n'
npm run ship || fail "Der Deploy hat angehalten (siehe oben). Die Live-Seite ist dann noch auf dem alten Stand."

printf '\n%s✓ Fertig. https://nikkimedia.co zeigt den neuen Stand (im Browser Cmd+Shift+R).%s\n' "$G$B" "$O"
