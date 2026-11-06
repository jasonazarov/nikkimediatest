-- Agenturen, Marken und Brand-Owner (Oktober 2026).
--
-- Über /brands tragen sich Agenturen und Brand-Owner ein, die ihre Kunden
-- von NIKKI MEDIA clippen lassen wollen (B2B). Sie bekommen eine fünfte Rolle
-- (`users.role = 'agency'`, die Spalte ist Text — keine Schemaänderung nötig)
-- und einen eigenen Bereich unter /collaboration.
--
-- Der Kern ist die Unterscheidung KALTER und WARMER Leads. Wer sich einträgt,
-- könnte ein Konkurrent sein; er darf deshalb nicht von selbst Einblick in
-- Kampagnen, Creator und Clipper bekommen. Warm ist nur, wer einen
-- Cooperation-Code einlöst, den der Administrator nach einem Erstgespräch
-- vergibt — sechs Zeichen, jeder genau EINMAL gültig.
--
-- Beide füllen nach dem Login das Briefing aus („Kampagne starten“). Danach
-- ist ein warmer Lead sofort freigeschaltet (`access_at`), ein kalter bleibt
-- gesperrt, bis der Administrator ihn freigibt.

-- Cooperation-Codes: sechs Zeichen, jeder genau einmal einlösbar. `used_at`
-- bleibt auch stehen, wenn der Lead später gelöscht wird — ein benutzter Code
-- wird nie wieder gültig.
CREATE TABLE cooperation_codes (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  note TEXT,
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL,
  used_at INTEGER,
  used_by TEXT REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX cooperation_codes_code_unique ON cooperation_codes (code);

CREATE TABLE agency_leads (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Arbeitsbereich für die eigenen Kampagnen (Ordner, Uploads, Cloud-Links) —
  -- dieselbe Zeile wie bei Kunden und Creatorn, ohne converted_at.
  customer_id TEXT REFERENCES customers(id) ON DELETE SET NULL,
  company TEXT,
  -- brand_owner | agentur | sonstiges
  kind TEXT NOT NULL,
  kind_other TEXT,
  -- JSON-Array, z. B. ["tiktok","instagram"]
  platforms TEXT NOT NULL,
  -- ads | chatgpt | google | empfehlung
  source TEXT NOT NULL,
  niche TEXT NOT NULL,
  -- JSON-Objekt { tiktok, instagram, youtube, facebook, website } — nur ausgefüllte
  socials TEXT NOT NULL,
  -- viel | keins
  footage TEXT NOT NULL,
  footage_link TEXT,
  -- 1 = mit Cooperation-Code eingetragen (oder vom Admin auf warm gesetzt)
  warm INTEGER NOT NULL DEFAULT 0,
  code_id TEXT REFERENCES cooperation_codes(id) ON DELETE SET NULL,
  -- NULL = gesperrt. Zugang hat, wer freigegeben ist UND das Briefing ausgefüllt hat.
  access_at INTEGER,
  -- Das Briefing nach dem Login („Kampagne starten“)
  views_target INTEGER,
  budget_cents INTEGER,
  -- armee | armee_influencer | armee_influencer_ugc
  package TEXT,
  briefed_at INTEGER,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX agency_leads_user_unique ON agency_leads (user_id);
CREATE INDEX agency_leads_created_idx ON agency_leads (created_at);

-- Buchungsanfragen: Eine freigeschaltete Agentur bucht einen Creator für eine
-- ihrer Kampagnen. Ins Team kommt er erst, wenn der Administrator bestätigt —
-- zugeordnet wird weiterhin ausschließlich im Admin-Bereich.
CREATE TABLE creator_bookings (
  id TEXT PRIMARY KEY,
  agency_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id TEXT NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  message TEXT,
  -- angefragt | bestaetigt | abgelehnt
  status TEXT NOT NULL DEFAULT 'angefragt',
  created_at INTEGER NOT NULL,
  decided_at INTEGER
);
CREATE INDEX creator_bookings_agency_idx ON creator_bookings (agency_user_id, created_at);
CREATE INDEX creator_bookings_status_idx ON creator_bookings (status, created_at);
