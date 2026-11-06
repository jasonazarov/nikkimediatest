-- Agenturen (Oktober 2026): eine neue Frage auf /brands und das Briefing je
-- Kampagne.
--
-- 1. Zweite Frage im Stepper auf /brands: „Hast du einen Kunden oder mehrere,
--    die sich für Clipping interessieren?“ — ja | nein. Einträge von vor
--    dieser Frage bleiben NULL.
ALTER TABLE agency_leads ADD COLUMN has_clients TEXT;

-- 2. Jede Kampagne einer Agentur entsteht über das Briefing (Views, Budget,
--    Auftrag) — auch die zweite, dritte, … Die Angaben hängen an der Kampagne
--    selbst; bisher standen sie nur einmal je Agentur in `agency_leads`.
--    NULL heißt: Kampagne ohne Briefing (Kunden, Creator, Admin).
ALTER TABLE projects ADD COLUMN briefing_views INTEGER;
ALTER TABLE projects ADD COLUMN briefing_budget_cents INTEGER;
-- Siehe AGENCY_PACKAGES: armee | armee_influencer | armee_influencer_ugc
ALTER TABLE projects ADD COLUMN briefing_package TEXT;

-- Die erste Kampagne jeder Agentur bekommt ihr Briefing nachgetragen.
UPDATE projects SET
  briefing_views = (SELECT a.views_target FROM agency_leads a WHERE a.project_id = projects.id),
  briefing_budget_cents = (SELECT a.budget_cents FROM agency_leads a WHERE a.project_id = projects.id),
  briefing_package = (SELECT a.package FROM agency_leads a WHERE a.project_id = projects.id)
WHERE id IN (SELECT project_id FROM agency_leads WHERE project_id IS NOT NULL AND briefed_at IS NOT NULL);
