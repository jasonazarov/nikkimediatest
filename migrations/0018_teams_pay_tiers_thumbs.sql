-- Drei Neuerungen vom Oktober 2026.
--
-- 1) Mehrere Bearbeiter je Kampagne.
--    Bisher hatte ein Projekt genau einen Bearbeiter (`projects.claimed_by`).
--    Der Administrator ordnet jetzt beliebig viele Clipper und Creator zu.
--    `notified_at` ersetzt für die Bearbeiter die Sperre `job_notified_at`:
--    jeder bekommt seine Job-Mail genau einmal, sobald Material da ist.
--    Die bisherigen Zuordnungen wandern mit; `claimed_by` bleibt als
--    Altlast stehen, wird aber nicht mehr gelesen.
CREATE TABLE project_workers (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  clipper_id TEXT NOT NULL REFERENCES clippers(id) ON DELETE CASCADE,
  assigned_at INTEGER NOT NULL,
  notified_at INTEGER,
  PRIMARY KEY (project_id, clipper_id)
);
CREATE INDEX project_workers_clipper_idx ON project_workers (clipper_id);

INSERT INTO project_workers (project_id, clipper_id, assigned_at, notified_at)
  SELECT id, claimed_by, COALESCE(claimed_at, created_at), job_notified_at
  FROM projects
  WHERE claimed_by IS NOT NULL;

-- 2) Preisstaffelung je Clipper und je Creator, festgelegt vom
--    Administrator: „Ab <min_views> Views → <amount_cents> Cent“.
CREATE TABLE pay_tiers (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  min_views INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX pay_tiers_user_idx ON pay_tiers (user_id, min_views);

-- 3) Eigenes Thumbnail je Kampagne (Admin, Kunde oder Creator lädt es
--    hoch). NULL heißt: automatisch — ein Bild aus dem Rohmaterial oder das
--    Symbol des Cloud-Anbieters.
ALTER TABLE projects ADD COLUMN thumb_key TEXT;
