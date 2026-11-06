-- Gold-Marktplatz, November 2026
--   articles         Fachartikel, im Admin gepflegt (/admin/fachartikel), öffentlich unter /fachartikel
--   upsell_requests  „Mehr Reichweite“ +10/25/50 % aus den Dashboards von Kunde und Agentur
--   customers.margin_pct  Aufschlag der Agentur auf unsere Preise (nur Anzeige im Agentur-Dashboard)

CREATE TABLE articles (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  source_url TEXT,
  author TEXT NOT NULL DEFAULT 'Jason Azarov',
  published INTEGER NOT NULL DEFAULT 1,
  published_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX articles_published_idx ON articles (published, published_at);

CREATE TABLE upsell_requests (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  percent INTEGER NOT NULL,
  base_views INTEGER NOT NULL,
  extra_views INTEGER NOT NULL,
  price_cents INTEGER NOT NULL,
  client_price_cents INTEGER,
  status TEXT NOT NULL DEFAULT 'offen',
  created_at INTEGER NOT NULL,
  done_at INTEGER
);
CREATE INDEX upsell_requests_status_idx ON upsell_requests (status, created_at);
CREATE INDEX upsell_requests_project_idx ON upsell_requests (project_id);

ALTER TABLE customers ADD COLUMN margin_pct INTEGER NOT NULL DEFAULT 0;
