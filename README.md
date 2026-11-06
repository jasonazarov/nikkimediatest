# Nikki Media — Plattform

Landingpage, Kunden-, Admin- und Clipper-Bereich auf Cloudflare Workers.

**Stack:** Hono + TypeScript · D1 (SQLite) mit Drizzle · R2 für Videos · Resend für E-Mail ·
serverseitig gerendertes HTML (Landingpage mit eigenem Design-System, Dashboards mit Tailwind CDN).
Kein React, kein Build-Framework, kein `localStorage`/`sessionStorage`.

**Live:** https://nikkimedia.co
**Cloudflare-Account:** `c80a29b391c87cab55592199b80c7663` (Jason.azarov@outlook.at) — steht in `wrangler.toml`.

---

## Die eine feste Adresse

Es gibt genau **eine** öffentliche URL, und jedes `npx wrangler deploy` aktualisiert
genau diese:

> **https://nikkimedia.co**

Keine Test-, Vorschau- oder Versionslinks daneben. Fünf Stellen sichern das ab:

| Stelle | Wert | Warum |
|---|---|---|
| `wrangler.toml` → `name` | `"nikki-media"` | **Nie ändern.** Der Worker-Name geht in die Adresse ein. |
| `wrangler.toml` → `workers_dev` | `false` | Schaltet die frühere Testadresse `nikki-media.deploy-claude.workers.dev` ab. |
| `wrangler.toml` → `preview_urls` | `false` | Cloudflare vergäbe sonst **pro Version** eine eigene Adresse `<version>-nikki-media.…workers.dev` — die Ursache für den ständig neuen Link. |
| `wrangler.toml` → `[[routes]]` | `nikkimedia.co`, `www.nikkimedia.co` | Die echte Domain, beide mit `custom_domain = true`. Nicht auskommentieren. |
| `src/index.ts` → `CANONICAL_HOST` | `nikkimedia.co` | Jeder andere Host wird per `301` auf die Hauptdomain umgeleitet — `www` liefert also keine zweite Fassung aus. |

Nach dem Deploy prüfen:

```bash
npx wrangler deploy
curl -I https://nikkimedia.co        # muss HTTP 200 liefern
curl -I https://www.nikkimedia.co    # muss HTTP 301 auf https://nikkimedia.co liefern
```

## Branch

`main` ist die **einzige** Arbeits- und Deploy-Linie. Was hier liegt, ist die Live-Version;
neue Arbeit kommt hier obendrauf. Die früheren Branches aus dem beendeten Vergleichslauf
zweier Agenten (`claude`, `codex`, `claude-video-preview-thumbnails-n7b7jk`) sind abgeräumt —
ihr Inhalt steckt über den Merge-Commit in der Historie von `main`.

Falls doch ein Arbeitsbranch nötig wird: keine Schrägstriche im Namen, wenn ein Branch mit
dem Namensteil davor existiert. Git legt Refs als Dateien ab, `x` und `x/y` schließen
einander aus und der Push wird abgelehnt.

---

## Bereiche

| Pfad | Rolle | Inhalt |
|---|---|---|
| `/` | öffentlich | Landingpage für Kunden mit fünfstufigem Anfrage-Formular (`#stepper`) |
| `/clipper` | öffentlich | Landingpage für Clipper (deutsch) — Selbsteintrag, danach direkt im Dashboard |
| `/creator` | öffentlich | Landingpage für Creator (deutsch, pink) — Selbsteintrag mit acht Schritten |
| `/login` | alle | Login per achtstelligem Code, ohne Passwort |
| `/app` | `customer` | Meine Dateien · Fertige Videos · Einstellungen |
| `/admin` | `admin` | Übersicht · Leads · Kunden · Projekte · Clipper · Creator |
| `/admin/projekte/<id>` | `admin` | Rohmaterial und fertige Reels eines Projekts — als Galerie im Browser |
| `/work` | `clipper` | Meine Projekte · Fertige Videos hochladen |
| `/kampagnen` | `creator` | „Dein Kampagnen-Dashboard“ · Zugeordnete Kampagnen · Meine Kampagnen · Verbreiten · Clip hochladen |

Jede Route prüft die Rolle; jede Rolle hat ihr eigenes Sitzungs-Cookie. Wer im Bereich nicht
angemeldet ist, landet beim Login dieses Bereichs (Admin: Passwortfeld unter derselben Adresse).
Im Clipper-Bereich erscheint ein Projekt nur mit seinem Namen — nie mit Firmen-, Kunden- oder
Kontaktangaben.

**Rohmaterial im Admin-Bereich.** Jedes Projekt hat unter `/admin/projekte/<id>` eine Galerie:
Rohmaterial nach Ordnern, darunter die fertigen Reels mit ihrem Veröffentlichungsstand. Alles läuft
im Browser — Klick auf eine Kachel öffnet den Player, Pfeiltasten gehen zur nächsten Aufnahme.
Heruntergeladen werden muss nichts. Die Vorschau-Adressen holt die Seite gebündelt und erst, wenn
eine Kachel ins Bild scrollt (`POST /api/admin/media/urls`).

**Telefonnummern.** Vorwahl und Nummer werden getrennt erfasst (`src/lib/phone.ts`) und als
`+<Vorwahl> <Nummer ohne führende Null>` gespeichert. Nur so lässt sich ein Lead aus dem
Admin-Bereich heraus direkt anrufen; eine Nummer ohne Ländervorwahl ist vom Handy aus nicht
wählbar. Die führende Null fällt beim Zusammensetzen weg, „0043“ und „+43“ landen beim selben Wert.

**Jobs nur per Zuordnung.** Clipper und Creator sehen keine offenen Projekte — weder welche es gibt
noch wie viele. Ihr Dashboard zeigt stattdessen „NIKKI MEDIA wird dir in Kürze eine Kampagne
zuordnen.“ (`ASSIGN_HEADLINE` in `views/layout.ts`) und darunter nur, was ihnen zugeordnet ist.
Rohmaterial und Cloud-Links sieht außer dem Besitzer nur der Administrator und nach der Zuordnung
der eine Bearbeiter (`clipperHasProject`). Zugeordnet wird ausschließlich unter `/admin/projekte`
(`assignProject` in `domain.ts`, `POST /api/admin/projects/:id/clipper`); Annehmen, Ausschreibung
an alle und automatische Vergabe gibt es nicht. Sobald in einem noch nicht zugeordneten Projekt das
erste Material liegt (`projectHasMaterial`), bekommt der Administrator eine Mail
(`notifyMaterialAdded` → `mailJobWaitingAdmin`). Technisch steckt die Zuordnung in
`projects.claimed_by`.

**Cloud-Links.** Nicht jeder hat sein Rohmaterial auf dem Gerät, an dem er gerade sitzt. Neben dem
Upload kann ein Kunde deshalb Links zu Cloud-Ordnern (Google Drive, Dropbox, iCloud …) an ein
Projekt hängen (`project_links`, nur https). Schon im Stepper der Startseite gibt es dafür ein
optionales Feld — daraus entsteht sofort ein erstes Projekt „Mein erstes Projekt“ mit dem Link.

**Clipper tragen sich selbst ein.** Neben der Einladung durch den Administrator gibt es `/clipper`:
Wer das Formular dort ausfüllt (`POST /api/clippers`), bekommt einen Zugang und eine Mail mit
Code. Nach der Code-Eingabe landet er in `/work` und wartet dort auf seine erste Zuordnung — ohne
Nachweis der Adresse bekäme sonst womöglich ein Fremder Kundenmaterial zugeordnet. Die Angaben stehen in
`clipper_applications` und im Admin unter „Clippers“.

**Creator.** Influencer und UGC-Creator tragen sich über `/creator` ein (`POST /api/creators`) und
bestätigen ihre Adresse wie Clipper mit dem Code aus der Willkommens-Mail. Ein Creator hat drei
Zeilen: `creators` (seine Angaben), `customers` (Arbeitsbereich für EIGENE Kampagnen — Rohmaterial
oder Cloud-Links, wie ein Kunde) und `clippers` (darüber bekommt er fremde Kampagnen zugeordnet und
liefert Clips, wie ein Clipper). Die Ansichten sind dieselben wie bei Kunden und Clippern, nur mit dem Wort
„Kampagne“ (`CREATOR_CAMPAIGN_AREA` in `views/app.ts`, `CREATOR_WORK_AREA` in `views/work.ts`).
Seine eigene Kampagne kann ihm nicht zugeordnet werden, und fertige Clips eigener Kampagnen sieht er
nicht zum Verbreiten.

**Selbsteintrag und bestehende Adressen.** Der Kunden-Stepper loggt nur ein, wer gerade NEU
angelegt wurde; der Clipper- und der Creator-Stepper nie. Gehört die Adresse schon zu einem Zugang, gibt es keine
Sitzung und es wird nichts in den Zugang geschrieben, sondern es folgt die Code-Eingabe — sonst
könnte jeder, der eine fremde Adresse kennt, sich über das Formular in deren Zugang setzen. Der
erste Code-Login verwirft alle älteren Sitzungen eines Kontos (`users.verified_at`). Eine Adresse
gehört immer zu genau einer Rolle.

**Ein Stepper-Skript für alle Formulare.** `public/assets/stepper.js` ist generisch: Endpunkt und
Texte stehen als JSON im Markup (`<script id="stepper-config">`), Pflichtfelder sagt das HTML
(`data-require`, `required`, `type="url"`, `data-show-if`). Farbthemen für die Landingpages
schaltet eine Klasse am `<body>` um (`theme-clipper`, `theme-creator`).

---

---

## Gold-Oberfläche und Marktplatz (seit November 2026)

Vorgabe des Auftraggebers: Schwarz-Gold, Aufbau angelehnt an Whop, Nikki Media als
Marktplatz für Auftraggeber, Agenturen, Clipper und Creator.

**Neue Landingpages** (`src/views/gold-pages.ts`, Styles `public/assets/gold.css`,
Verhalten `public/assets/gold.js`):

| Pfad | Zielgruppe | Formular |
|---|---|---|
| `/agenturen` | Agenturen, die ihre Kunden mitbringen | `agencyStepper()` → `POST /api/agencies` (identisch mit `/brands`) |
| `/personal-brands` | Personal Brands | `leadStepper()` → `POST /api/leads` (identisch mit `/`) |
| `/investoren` | Investoren | eigenes Formular → `POST /api/investors` (Mail an `ADMIN_EMAIL` + `audit_log`, keine Tabelle) |

Die Formulare sind KEINE Kopien: `leadStepper`/`leadLoadscreen` stehen in `landing.ts`,
`agencyStepper`/`agencyLoadscreen` in `brands-landing.ts`, und `/`, `/brands` sowie die
Gold-Seiten rendern dieselben Funktionen. Wer ein Formular ändert, ändert es überall.

Der Hero jeder Gold-Seite ist ein Dashboard mit **Views-Regler** (1 bis 50 Mio.).
Preis: `PRICE_PER_MILLION_EUR` in `src/lib/faq.ts` (5.000 € je Mio. Views). Die Kurve
rechnen `reachChart()` (Server) und `gold.js` (Browser) mit derselben Formel.

**FAQ-Agent** (`src/lib/faq.ts`, `public/assets/agent.js`, `POST /api/agent/faq`): Eine
Wissensbasis für den Agenten UND die FAQ-Abschnitte der Gold-Seiten. Ohne Secret
antwortet er per Stichwortabgleich; mit `ANTHROPIC_API_KEY` (optional `AGENT_MODEL`)
formuliert ein Sprachmodell, darf aber nur Fakten aus der Wissensbasis nutzen. Fällt
das Modell aus, antwortet der Abgleich. Gedrosselt: 40 Fragen je IP und Stunde. Der
Agent erscheint auf den Gold-Seiten und in allen Dashboards außer Admin.

**Dashboards** (`shell()` in `src/views/layout.ts`, `public/assets/dash-glass.css`):
Schwarz-Gold mit Seitenleiste, Kopfzeile und Sprung-Suche („/“). Die einzelnen Seiten
wurden nicht umgeschrieben: `dash-glass.css` legt ihre hellen Tailwind-Klassen auf
Dunkel um (`html.nmd`, mit `!important`, weil das Tailwind-CDN sein CSS danach
einfügt). Neue helle Klasse in einer View → dort in der Zuordnung ergänzen.
Die Farbbänder „Eigene Kampagne“ (grün) und „Zugewiesene Kampagne“ (blau) bleiben.

**Virale Clips** (`src/lib/viral.ts`, `public/assets/viral.js`, `GET /api/viral-clips?area=<rolle>`):
die Clips mit den meisten Views, auf der Übersicht jedes Bereichs. Admin alles,
Kunde und Agentur eigene Kampagnen, Clipper selbst gelieferte Clips, Creator eigene
Kampagnen, eigene Clips und eigene Verbreitung. Accountnamen und Links nur für Admin,
Kunde und Agentur. Bei Clipper und Creator steht das Feld UNTER dem Seiteninhalt, weil
die Preisstaffelung ganz oben bleiben muss; bei gesperrtem Agentur-Zugang fehlt es.

**Fachartikel** (`src/lib/articles.ts`, `src/views/gold-articles.ts`, Migration 0023): im Admin unter
„Fachartikel“ (`/admin/fachartikel`) von Hand angelegt. Öffentlich unter `/fachartikel` und
`/fachartikel/<adresse>` mit schema.org/Article, im Block „Fachartikel“ auf `/`, `/agenturen`,
`/personal-brands`, `/investoren` (nur wenn es Artikel gibt), in der Sitemap und in `/llms.txt`.
Text: Leerzeile = Absatz, „## “ = Zwischenüberschrift, „- “ = Liste. Alles wird escaped. Fehlt die
Tabelle (Migration nicht eingespielt), zeigen die Seiten einfach keinen Block (`safeArticles`).

**Upsells** (`src/lib/upsell.ts`, `public/assets/upsell.js`, Admin `/admin/upsells`): auf der Übersicht
von Kunden (nur nach `converted_at`) und freigeschalteten Agenturen je laufender Kampagne +10/+25/+50 %
Views. Ein Klick ist eine ANFRAGE (`upsell_requests`, Mail an `ADMIN_EMAIL`), kein Auftrag. Preise
rechnet nur der Server: Briefing-Preis je 1.000 Views, sonst 5 €; Basis Briefing-Views, sonst
erreichte Views, sonst 1 Mio.

**Agentur-Marge** (`customers.margin_pct`, Seite `/collaboration/preise`, `PUT /api/agency/margin`):
Aufschlag in Prozent (0 bis 300). Reine Anzeige: Kundenpreis und Marge auf „Preise & Marge“ und bei
den Upsells. Was NIKKI MEDIA berechnet, ändert sie nicht.

**Tests ohne Worker** (`tests/gold/`): echte Migrationen auf SQLite (`node:sqlite`), dann die Logik
von Upsell, Marge, Artikeln und „Virale Clips“:
`npx tsx tests/gold/logic.test.ts` und `npx tsx tests/gold/viral.test.ts`.

**Deploy dieser Stufe:** Migration 0023 ZUERST einspielen
(`npx wrangler d1 migrations apply nikki-media --remote`), dann `npm run ship`.

## Erste Einrichtung

### 1. Abhängigkeiten

```bash
npm install
```

### 2. Secrets setzen

Diese vier Werte gehören **nicht** ins Repository, sondern per `wrangler secret put`:

```bash
npx wrangler secret put AUTH_SECRET            # openssl rand -hex 32  (bereits gesetzt)
npx wrangler secret put RESEND_API_KEY         # https://resend.com/api-keys
npx wrangler secret put R2_ACCESS_KEY_ID       # Dashboard → R2 → Manage API Tokens
npx wrangler secret put R2_SECRET_ACCESS_KEY
```

Lokal stattdessen `.env.example` nach `.dev.vars` kopieren und ausfüllen
(`.dev.vars` ist in `.gitignore`).

Alle übrigen Werte (`APP_URL`, `MAIL_FROM`, `ADMIN_EMAIL`, `STORAGE_WARN_BYTES` …)
stehen als `[vars]` in `wrangler.toml` und dürfen dort angepasst werden.

### 3. Datenbank

Die D1-Datenbank `nikki-media` existiert bereits
(`database_id = 405c50a6-7503-4440-a066-eeadd33c842f`) und ist migriert.
Für eine frische Umgebung:

```bash
npx wrangler d1 create nikki-media                       # database_id in wrangler.toml eintragen
npx wrangler d1 migrations apply nikki-media --remote
```

Schemaänderungen:

```bash
npm run db:generate     # erzeugt eine neue Migration aus src/db/schema.ts
```

### 4. R2 aktivieren (nötig für Uploads)

**R2 ist in diesem Account noch nicht freigeschaltet.** Solange das so bleibt, funktioniert
die Plattform vollständig — nur Upload, Download und Videovorschau antworten mit
`503` und einer verständlichen Meldung.

```bash
# 1. Dashboard → R2 → aktivieren (einmalig, Zahlungsmittel hinterlegen)
npx wrangler r2 bucket create nikki-media
npx wrangler r2 bucket cors put nikki-media --file r2-cors.json
# 2. in wrangler.toml den Block [[r2_buckets]] einkommentieren
# 3. Secrets R2_ACCESS_KEY_ID und R2_SECRET_ACCESS_KEY setzen
npx wrangler deploy
```

Die CORS-Regel in `r2-cors.json` erlaubt `PUT`/`GET` vom eigenen Ursprung und gibt den
`ETag`-Header frei — ohne ihn scheitert der Multipart-Upload im Browser.

### 5. Resend-Domain verifizieren

`MAIL_FROM` ist auf `noreply@nikkimedia.co` eingestellt. Die Domain muss in Resend
verifiziert sein (SPF/DKIM), sonst werden keine E-Mails zugestellt.

### 6. Admin-Zugang

Der Admin-Nutzer ist angelegt:

```
jason.azarov@outlook.at · Rolle admin
```

Login über `/login` → Code kommt per E-Mail (setzt `RESEND_API_KEY` voraus).
Weitere Admins:

```bash
npx wrangler d1 execute nikki-media --remote --command \
  "INSERT INTO users (id,email,role,full_name,created_at) VALUES (lower(hex(randomblob(16))),'name@firma.de','admin','Vorname Nachname',unixepoch())"
```

### 7. Domain verbinden

`nikkimedia.co` liegt derzeit **nicht** in diesem Cloudflare-Account. Ablauf:

1. Zone `nikkimedia.co` in Account `c80a29b391c87cab55592199b80c7663` hinzufügen
2. Nameserver beim Registrar auf die von Cloudflare genannten umstellen
3. In `wrangler.toml` die beiden `[[routes]]`-Blöcke am Dateiende einkommentieren
4. `npx wrangler deploy`

---

## Entwicklung

```bash
npm run dev          # lokaler Worker auf http://localhost:8787
npm run typecheck    # tsc --noEmit
npm run deploy       # npx wrangler deploy
```

---

## Aufbau

```
migrations/            SQL-Migrationen für D1
public/
  assets/              site.css · site.js (Landingpage) · stepper.js · upload.js
  img/platforms/       Logos aller Plattformen als SVG (Instagram, TikTok, YouTube, Facebook, X, LinkedIn, Snapchat, Twitch)
src/
  db/schema.ts         Drizzle-Schema (alle Tabellen)
  lib/
    auth.ts            Login-Codes, Sessions, Rollenprüfung, Rate-Limits
    db.ts              Drizzle-Verbindung zu D1
    domain.ts          Auswahllisten, Jobs (Zuordnung durch den Admin), Löschen, Speicherwarnung
    mail.ts            Resend-Versand + alle Vorlagen (alle deutsch — Kunde, Admin, Clipper, Creator)
    phone.ts           Ländervorwahlen, Zusammensetzen/Zerlegen von Telefonnummern
    r2.ts              presigned URLs, Multipart-Upload, Dateitypen
    audit.ts           Änderungsprotokoll
    publisher.ts       Veröffentlichung (anbieterneutral): Accounts, Steckplätze, Versand, Nachholen, Verbreitung
    zernio.ts          HTTP-Schicht zum Anbieter Zernio (Posts, Accounts, Analytics)
    metrics.ts         echte Zahlen: Abgleich mit Zernio-Analytics und Summen für die Dashboards
  routes/              public · auth · api · app · admin · work · campaigns · creator-api
  views/               SSR-Templates (landing, clipper, creator-landing, legal, login, layout, app, admin, work, campaigns, metrics)
  index.ts             Worker-Einstieg, Fehlerseiten, täglicher Cron
```

---

## Uploads

Videos laufen **nie** durch den Worker — der kennt nur signierte URLs.

1. Browser fordert `POST /api/app/uploads/init` an → Worker legt den Datensatz an und
   startet bei ≥ 16 MB einen Multipart-Upload
2. Browser holt pro Teil eine signierte URL (`/uploads/part`) und lädt direkt zu R2
3. `POST /api/app/uploads/complete` schließt ab, liest die echte Größe und schreibt
   die Speicherbilanz fort

Bereits übertragene Teile stehen in `raw_assets.upload_parts`; ein abgebrochener Upload
lässt sich damit fortsetzen. Downloads und Vorschauen sind ebenfalls signiert, eine Stunde gültig.

R2-Keys: `{customerId}/{folderId}/{uuid}-{filename}`

---

## Social-Accounts, Verbreitung über Creator, echte Zahlen

**Accounts selbst verbinden.** Kunden verbinden ihre Social-Accounts je Projekt selbst (Projektseite →
„Social-Accounts“), Creator einmal für sich (`/kampagnen/accounts`). Automatisch gepostet wird auf
Instagram, TikTok, YouTube, X, Facebook (Seiten-Video) und LinkedIn. Twitch gibt es bei Zernio nicht,
Snapchat ist dort geschlossene Beta — dort postet der Creator selbst und trägt den Link zum Beitrag ein.
Ein Account gehört genau einem Besitzer: einem Projekt ODER einem Creator (`publish_accounts.project_id`
bzw. `creator_id`, Migration 0014). Obergrenzen: 50 Accounts je Kunde, 10 je Creator — geprüft beim Erzeugen
des Links UND bei der Ankunft des Accounts (Rückkehr, Webhook, Abgleich); wer zwei Links vorab öffnet, bekommt den
überzähligen verworfen und drüben getrennt. Der Admin verbindet für Projekte ohne Grenze: sein Link markiert den
Steckplatz (`publish_profiles.admin_link_at`, Migration 0016), ein Kundenlink löscht die Marke wieder.

**Wer einen Clip automatisch bekommt.** Die Accounts des Projekts — und, wenn das Projekt einem Creator
gehört (eigene Kampagne), zusätzlich seine Creator-Accounts.

**Verbreitung über Creator.** Der Kunde (oder der Admin) schaltet je Projekt „Clips zusätzlich über Creator
verbreiten“ ein (`projects.creator_distribution`, Standard aus). Der Admin ordnet unter `/admin/projekte`
einzelne Creator zu (`assignDistribution`, `POST /api/admin/projects/:id/creators`); selbst beitreten kann
niemand, und andere freigegebene Kampagnen sieht ein Creator nicht. Unter `/kampagnen/verbreiten` sieht er
die fertigen Clips seiner Kampagnen als Vorschau und klickt „Freigeben & posten“. Jede Freigabe hat ihren eigenen
Veröffentlichungsstand (`clip_approvals`), der Stand am Clip selbst bleibt davon unberührt. Aus einer pausierten
oder beendeten Kampagne geht nichts mehr raus, auch kein Nachschuss eines halb veröffentlichten Clips.

**Gegen Doppelposts und liegengebliebene Clips** (`publisher.ts`): Ziele werden per Vergleichen-und-Tauschen
belegt, bevor gesendet wird; jeder Aufruf trägt einen `Idempotency-Key`, und ein Versuch mit unklarem Ausgang
(Abbruch, 5xx, verwaiste Belegung nach 30 Minuten) geht mit DEMSELBEN Schlüssel erneut raus — Zernio liefert
dann binnen 24 h den ursprünglichen Post statt eines zweiten. Dasselbe echte Konto bei zwei Besitzern bekommt
den Clip höchstens einmal — auch wenn ein Creator mit offenem Versand (etwa 502) aus der Kampagne genommen wird: sein
ungeklärter Versuch sperrt das Konto weiter, bis der Webhook kommt oder der Schlüssel nach 24 h abläuft.

**Kosten.** Zernio rechnet je verbundenem Account und Monat ab (1–2 frei, 3–10 je $6, 11–100 je $3, ab 101 je $1;
jede Stufe nur für ihren Bereich). Die Admin-Übersicht zeigt die Zahl der Accounts und die geschätzten Kosten.
Beim Löschen eines Projekts oder Creators werden seine Accounts beim Anbieter getrennt.

**Echte Zahlen.** Der Viertelstunden-Cron gleicht die Zahlen jedes veröffentlichten Posts mit
`GET /v1/analytics` ab (`metrics.ts`, Tabellen `post_metrics` und `metrics_sync`, Migration 0015): frische Clips
stündlich, ältere seltener, höchstens 20 Abrufe je Lauf. Views, Likes, Kommentare und Shares erscheinen in allen
Dashboards — Kunden je Projekt und Clip, Creator je Kampagne und für ihre Verbreitung, Clipper für ihre Clips
(nur Zahlen, ohne Accountnamen), der Admin für alles.

## Automatik

Alle 15 Minuten: Selbsttest der Anmeldung, Nachholen offener Veröffentlichungen und Freigaben, Abgleich der Zahlen.

Der Cron (`0 7 * * *`) erledigt täglich:

- Speicherwarnung an Jason, sobald ein Kunde 100 GB überschreitet (einmalig pro Kunde)
- endgültiges Löschen von Papierkorb-Inhalten, die älter als 30 Tage sind
- Aufräumen abgelaufener Sessions, Login-Codes und Rate-Limit-Zähler

---

## Sicherheit

- Login-Codes werden nur als HMAC-SHA256 gespeichert, nie im Klartext
- 15 Minuten gültig, maximal 5 Versuche, danach 30 Minuten Sperre für die Adresse
- Session-Cookie: `httpOnly`, `secure`, `SameSite=Lax`, 30 Tage
- jede Abfrage ist auf die Rolle gefiltert; Clipper-Endpunkte liefern nie
  `company` oder `full_name` des Kunden
- alle schreibenden Aktionen landen im `audit_log`
- `/api/leads` und `/api/clippers`: maximal 5 Anfragen pro IP und Stunde, zusätzlich ein
  Honeypot-Feld (Treffer → Erfolg anzeigen, Eintrag verwerfen)
- Selbsteintrag mit einer bereits bekannten Adresse erzeugt nie eine Sitzung, sondern schickt
  einen Login-Code
