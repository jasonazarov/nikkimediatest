-- Oktober 2026, Vorgaben des Auftraggebers:
--
-- 1. Der Stepper „Neue Kampagne“ fragt jetzt Name, Bereich, Plattformen,
--    Views und Budget. Bereich und Plattformen hängen an der Kampagne.
ALTER TABLE projects ADD COLUMN briefing_niche TEXT;
-- JSON-Array, z. B. ["tiktok","instagram"]
ALTER TABLE projects ADD COLUMN briefing_platforms TEXT;

-- Die erste Kampagne jeder Agentur bekommt Nische und Plattformen aus ihrem
-- Eintrag auf /brands nachgetragen.
UPDATE projects SET
  briefing_niche = (SELECT a.niche FROM agency_leads a WHERE a.project_id = projects.id),
  briefing_platforms = (SELECT a.platforms FROM agency_leads a WHERE a.project_id = projects.id)
WHERE id IN (SELECT project_id FROM agency_leads WHERE project_id IS NOT NULL);

-- 2. Demo-Konten (Agentur, Creator, Clipper): Anmeldung mit E-Mail und
--    Passwort unter /login/demo, keine Mails an ihre Adressen
--    (@demo.nikkimedia.co hat kein Postfach), für echte Agenturen unsichtbar.
ALTER TABLE users ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
UPDATE users SET demo = 1 WHERE id IN (SELECT user_id FROM agency_leads WHERE demo = 1);

-- 3. Keine langen Gedankenstriche mehr: Kampagnen, die das Briefing einer
--    Agentur automatisch benannt hat („Firma — Paket“), heißen „Firma · Paket“.
UPDATE projects SET name = REPLACE(name, ' — ', ' · ')
WHERE name LIKE '% — %' AND customer_id IN (SELECT customer_id FROM agency_leads WHERE customer_id IS NOT NULL);
