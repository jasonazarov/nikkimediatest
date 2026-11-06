#!/usr/bin/env bash
#
# ship — der verbindliche Weg, eine Änderung live zu bringen.
# Siehe REGEL 0 in CLAUDE.md. Aufruf:
#
#     npm run ship -- "Commit-Nachricht"     wenn es offene Änderungen gibt
#     npm run ship                           wenn schon alles committet ist
#
# Bricht bei jedem Fehler ab. Fertig ist erst, wenn die beiden Prüfungen
# am Ende stimmen.

set -euo pipefail

cd "$(dirname "$0")/.."

BOLD=$'\033[1m'; RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; OFF=$'\033[0m'
step () { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$OFF"; }
fail () { printf '\n%s✘ %s%s\n' "$RED" "$1" "$OFF" >&2; exit 1; }
ok   () { printf '%s✓ %s%s\n' "$GREEN" "$1" "$OFF"; }

MESSAGE="${1:-}"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"

# ---------------------------------------------------------------- 1. Typen
step "1/6  Typen prüfen"
npx tsc --noEmit || fail "TypeScript meldet Fehler. Kein Deploy mit kaputten Typen."
# Tailwind ist vorgebaut (public/assets/tw.css). Neu bauen, damit keine Klasse
# fehlt, die seit dem letzten Bau dazugekommen ist.
npm run --silent css >/dev/null 2>&1 || fail "Tailwind-CSS ließ sich nicht bauen (npm run css)."
ok "Tailwind-CSS gebaut"
ok "tsc --noEmit sauber"

# ----------------------------------------------------------- 2. Login-Test
#
# Der Anmeldeweg wird vor jedem Deploy einmal komplett durchgespielt: Code
# anfordern, einlösen, denselben Code ein zweites Mal, älterer neben neuerem,
# falscher, abgelaufener, Sperre, Passwort-Login, geschützte Bereiche.
#
# Der Grund steht im Commit vom 31.08.2026: Ein Clipper sah „There is no
# valid code", obwohl die Anmeldung im selben Moment durchlief. Aufgefallen
# ist es niemandem, weil den Weg nie etwas automatisch gegangen ist. Genau
# das tut dieser Schritt — und ohne ihn gibt es keinen Deploy.
step "2/6  Login-Test"
node scripts/login-test.mjs || fail "Der Login-Test ist durchgefallen. KEIN Deploy — sonst kommt womöglich niemand mehr hinein."

# --------------------------------------------------------------- 3. Commit
step "3/6  Änderungen sichern"
if [ -n "$(git status --porcelain)" ]; then
  [ -n "$MESSAGE" ] || fail 'Es gibt offene Änderungen. Aufruf: npm run ship -- "Commit-Nachricht"'
  git add -A
  git commit -q -m "$MESSAGE"
  ok "committet auf $BRANCH: $MESSAGE"
else
  ok "nichts Offenes"
fi

# --------------------------------------------- 3. Alles auf main versammeln
#
# wrangler deploy lädt das ARBEITSVERZEICHNIS hoch, nicht einen Branch.
# Deshalb muss main der Stand sein, von dem aus deployt wird — sonst wirft
# der nächste Deploy von main die Seite auf den alten Stand zurück.
step "4/6  Auf main bringen"
git fetch --quiet origin main || fail "git fetch fehlgeschlagen."

if [ "$BRANCH" != "main" ]; then
  printf '%s   Arbeitsbranch %s wird nach main gemerged.%s\n' "$DIM" "$BRANCH" "$OFF"
  git checkout --quiet main 2>/dev/null || git checkout --quiet -b main origin/main
  git merge --quiet --ff-only origin/main 2>/dev/null || true
  git merge --quiet --no-edit "$BRANCH" || fail "Merge nach main hat Konflikte. Bitte von Hand auflösen."
else
  git merge --quiet --ff-only origin/main 2>/dev/null || true
fi
ok "main = $(git log --oneline -1)"

# ----------------------------------------------------------------- 4. Push
step "5/6  Push nach origin/main"
for attempt in 1 2 3 4; do
  if git push --quiet -u origin main; then ok "gepusht"; break; fi
  [ "$attempt" = 4 ] && fail "Push nach 4 Versuchen fehlgeschlagen."
  sleep $((2 ** attempt))
done

# --------------------------------------------------------------- 5. Deploy
#
# Die rote Zeile "/zones/.../workers/routes → Authentication error 10000"
# ist KEIN fehlgeschlagener Deploy, sondern ein fehlendes Zonenrecht des
# Account-API-Tokens. Entscheidend sind die beiden Prüfungen danach.
step "6/6  Deploy und Prüfung"
npx wrangler deploy || printf '%s   (Meldungen oben prüfen — die Kontrolle folgt.)%s\n' "$DIM" "$OFF"

sleep 3
MAIN_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://nikkimedia.co/?cb=$RANDOM")
WWW_CODE=$(curl -s -o /dev/null -w '%{http_code}' "https://www.nikkimedia.co/?cb=$RANDOM")

[ "$MAIN_CODE" = "200" ] || fail "nikkimedia.co liefert $MAIN_CODE statt 200. NICHT live."
[ "$WWW_CODE" = "301" ] || fail "www.nikkimedia.co liefert $WWW_CODE statt 301. NICHT live."

ok "nikkimedia.co → 200"
ok "www.nikkimedia.co → 301"
printf '\n%s✓ Live auf https://nikkimedia.co%s\n\n' "$GREEN$BOLD" "$OFF"
