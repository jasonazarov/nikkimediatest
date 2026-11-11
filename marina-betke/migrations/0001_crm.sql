-- Lead-CRM: Anfragen aus dem Stepper auf /terminbuchung/, Verlauf, Admin-Sitzungen.

CREATE TABLE leads (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  nr                   TEXT    NOT NULL UNIQUE,          -- 6 Ziffern, steht in WhatsApp und Mail
  created_at           INTEGER NOT NULL,                 -- ms seit 1970
  updated_at           INTEGER NOT NULL,
  status               TEXT    NOT NULL DEFAULT 'neu',   -- neu | kontaktiert | termin | klient | verloren
  vorname              TEXT    NOT NULL,
  telefon              TEXT    NOT NULL,                 -- mit Ländervorwahl, z. B. +49 151 23456789
  email                TEXT,
  situation            TEXT    NOT NULL,                 -- beziehung | getrennt | onoff | anderes
  start                TEXT    NOT NULL,                 -- sofort | wochen | informieren
  budget               TEXT    NOT NULL,                 -- ja | raten
  erreichbar           TEXT,                             -- vormittags | nachmittags | abends | egal
  woher                TEXT,                             -- instagram | anzeige | tiktok | google | empfehlung | anderes
  quelle               TEXT,                             -- Video-Kennung aus ?q=
  einwilligung_at      INTEGER NOT NULL,
  einwilligung_version TEXT    NOT NULL,
  ip_hash              TEXT,                             -- nur gehasht, für die Drosselung
  user_agent           TEXT
);
CREATE INDEX leads_created ON leads (created_at);
CREATE INDEX leads_status  ON leads (status, created_at);
CREATE INDEX leads_telefon ON leads (telefon, created_at);
CREATE INDEX leads_ip      ON leads (ip_hash, created_at);

-- Verlauf je Lead: angelegt, Statuswechsel, Notizen, erneute Anfrage.
CREATE TABLE lead_events (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  lead_id INTEGER NOT NULL REFERENCES leads (id) ON DELETE CASCADE,
  at      INTEGER NOT NULL,
  kind    TEXT    NOT NULL,   -- angelegt | status | notiz | erneut
  text    TEXT    NOT NULL
);
CREATE INDEX lead_events_lead ON lead_events (lead_id, at);

-- Admin-Sitzungen: im Cookie steht ein Zufallswert, hier nur sein Hash.
CREATE TABLE sessions (
  token_hash TEXT    PRIMARY KEY,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

-- Fehlversuche beim Login, für die Drosselung (5 je 15 Minuten).
CREATE TABLE login_attempts (
  ip_hash TEXT    NOT NULL,
  at      INTEGER NOT NULL
);
CREATE INDEX login_attempts_ip ON login_attempts (ip_hash, at);
