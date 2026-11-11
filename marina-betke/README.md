# Marina Betke: Webseite + Lead-CRM

Die komplette Seite von marinabetke.de (30 Seiten, alle Bilder, Video, Schriften,
Texte), dazu ein **Stepper** auf `/terminbuchung/` und dahinter **nur ein CRM**, das
die Anfragen sammelt. Technik wie bei Nikki Media: Hono + TypeScript auf Cloudflare
Workers, D1-Datenbank, serverseitig gerendertes HTML.

Eigenständiger Worker `marina-betke` mit eigener Datenbank. Er hat nichts mit
`nikki-media` oder nikkimedia.co zu tun.

## Aufbau

| Pfad | Was |
|---|---|
| `public/` | alle Seiten von marinabetke.de, statisch ausgeliefert |
| `src/templates/terminbuchung.html` | die Terminseite von marinabetke.de als Vorlage |
| `src/views/stepper.ts` | der Stepper (Markup), eingesetzt in die Vorlage |
| `public/assets/js/stepper.js` | Verhalten des Steppers |
| `public/assets/css/stepper.css` | Optik des Steppers (Marinas Farben und Schriften) |
| `src/lib/fragen.ts` | **eine** Quelle für Fragen, Antworten und CRM-Status |
| `src/lib/leads.ts` | Prüfen, Speichern, Lesen der Leads |
| `src/views/admin.ts`, `public/assets/css/crm.css` | das CRM unter `/admin` |
| `migrations/0001_crm.sql` | Tabellen: `leads`, `lead_events`, `sessions`, `login_attempts` |
| `scripts/test.mjs` | `npm test`: 47 Prüfungen gegen einen echten lokalen Worker |

## Der Stepper

Aufbau wie das Stepper-Formular von Nikki Media: eine Karte, „Schritt n von 6 ·
Titel“, Punkte, Fortschrittsbalken, Antwort-Kacheln, Einzelauswahl springt von selbst
weiter, Zurück/Weiter, Ladebildschirm nach dem Absenden. Fragen, Texte und Optik von
marinabetke.de:

1. **Sicherheit**: akute Krise? „Ja“ zeigt sofort die Notrufnummern, es wird nichts gespeichert.
2. **Situation**: noch in der Beziehung / getrennt / mal so, mal so / anderes Thema
3. **Zeitpunkt**: mit Marinas Satz zur gewählten Situation darüber
4. **Rahmen**: die 3 Wege mit Preisen und Stefans Sprachnachricht. „Nein“ führt zum Klarheitsguide, nichts gespeichert.
5. **Erreichbarkeit**: vormittags / nachmittags / abends / egal. Ersetzt die Kalenderwahl der alten Seite.
6. **Kontakt**: Vorname, WhatsApp-Nummer mit Ländervorwahl, E-Mail (freiwillig), „Wodurch bist du auf mich gestoßen?“ (freiwillig), Einwilligung.

Die Zurück-Taste des Handys geht eine Frage zurück. `?q=<video>` im Link (z. B. aus den
Ratgeber-Artikeln) wird am Lead als Video-Kennung gespeichert.

## Das CRM (`/admin`)

Übersicht mit Kennzahlen, Pipeline (Neu → Kontaktiert → Termin vereinbart → Klient /
Kein Interesse), Grafik der letzten 30 Tage, Auswertung nach Situation, Herkunft und
Video. Liste mit Statusfilter und Suche (Name, Anfrage-Nr., Telefon, E-Mail; „/“
springt in die Suche). Je Lead: alle Antworten, WhatsApp mit vorbereiteter Nachricht,
Anrufen, E-Mail, Status, Notizen mit Verlauf, endgültig löschen. CSV-Export.

Login mit einem Passwort (Secret `ADMIN_PASSWORD`), Sitzung 30 Tage, 5 Fehlversuche je
15 Minuten. Optional eine Mail bei jeder neuen Anfrage (Resend).

## Lokal starten

```bash
npm install
```

```bash
printf 'ADMIN_PASSWORD="lokal"\n' > .dev.vars
```

```bash
npm run db:migrate:local
```

```bash
npm run dev
```

Dann http://localhost:8787/terminbuchung/ und http://localhost:8787/admin.

## Prüfen

```bash
npx tsc --noEmit
```

```bash
npm test
```

## Live schalten (einmalig)

```bash
npx wrangler d1 create marina-betke-crm
```

Die ausgegebene `database_id` in `wrangler.toml` eintragen, dann:

```bash
npx wrangler d1 migrations apply marina-betke-crm --remote
```

```bash
npx wrangler secret put ADMIN_PASSWORD
```

```bash
npx wrangler secret put IP_SALT
```

```bash
npx wrangler deploy
```

Optional Mail bei neuer Anfrage: `npx wrangler secret put RESEND_API_KEY` und in
`wrangler.toml` unter `[vars]` `ADMIN_EMAIL` und `MAIL_FROM` setzen.

Eigene Domain: in `wrangler.toml` den Block `[[routes]]` einkommentieren und
`workers_dev = false` setzen.

## Was gegenüber marinabetke.de anders ist

- **Cookie-Banner (CCM19) entfernt**: Der Schlüssel ist an marinabetke.de gebunden, und
  die Seite setzt keine Tracking-Cookies. Das CRM setzt nur ein technisch nötiges
  Login-Cookie für `/admin`.
- **Anonymer Seitenzähler und Fragebogen-Zählung entfernt** (liefen über PHP-Endpunkte
  von marinabetke.de).
- **Kundenstimmen-Skript entfernt**: Die Schnittstelle lieferte keine Stimmen, die
  Kästen bleiben wie bisher unsichtbar.
- **Terminkalender ersetzt** durch die Frage nach der Erreichbarkeit: Marina meldet sich
  per WhatsApp.

**Datenschutzerklärung anpassen, bevor die Seite unter eigener Domain live geht.** Der
Text ist unverändert übernommen und nennt noch CCM19, Strato als Hoster und die alte
Verarbeitung der Fragen. Neu sind: Hosting und Datenbank bei Cloudflare, Speicherung der
Anfragen im CRM, optional Mailversand über Resend. Die Einwilligung im Formular trägt
die Textfassung `2026-11-11` (`EINWILLIGUNG_VERSION` in `src/lib/fragen.ts`), sie wird
an jedem Lead gespeichert.
