-- Angefangene Kampagnen-Formulare im Kunden-Dashboard (Vorgabe des Auftraggebers,
-- November 2026). Jede gewählte Angabe wird schon vor dem Absenden gespeichert;
-- wer nicht abschickt, taucht nach 2 Stunden beim Admin auf und bekommt nach
-- 24 Stunden eine Erinnerung. Siehe src/lib/drafts.ts. Nur eine neue Tabelle.
CREATE TABLE campaign_drafts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT REFERENCES customers(id) ON DELETE CASCADE,
  name TEXT,
  duration_days INTEGER,
  views INTEGER,
  started_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  submitted_at INTEGER,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  admin_notified_at INTEGER,
  reminded_at INTEGER
);
CREATE INDEX campaign_drafts_user_idx ON campaign_drafts (user_id, submitted_at);
CREATE INDEX campaign_drafts_open_idx ON campaign_drafts (submitted_at, updated_at);
