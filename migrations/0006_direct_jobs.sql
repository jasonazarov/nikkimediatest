-- Drei Aufräumarbeiten in einem Schritt. Sie hängen zusammen: alle drei
-- entfernen Handarbeit oder Kunstbezeichnungen aus dem System.
--
-- 1. KEINE MANUELLE ZUORDNUNG MEHR
--
--    Bisher ordnete der Administrator jedem Projekt von Hand einen oder
--    mehrere Freelancer zu (Tabelle `assignments`). Das kostete bei jedem
--    neuen Projekt einen Handgriff — und solange der ausblieb, lag das
--    Projekt still.
--
--    Ab jetzt gilt: ein Projekt ist ein Job. Entsteht es, werden alle
--    Freelancer benachrichtigt; wer zuerst annimmt, bekommt ihn. Gibt es nur
--    einen Freelancer, bekommt er ihn sofort ohne Zwischenschritt.
--
--    Damit hat ein Projekt genau NULL oder EINEN Freelancer — eine Spalte
--    statt einer Tabelle. `claimed_by` NULL heißt: der Job ist offen und für
--    alle sichtbar. ON DELETE SET NULL sorgt dafür, dass ein gelöschter
--    Freelancer das Projekt wieder freigibt, statt es mitzunehmen.
--
-- 2. KEINE CODENAMEN MEHR ("Projekt R90", "Kunde A12")
--
--    Sie sollten den Kundenbezug vor Freelancern verbergen. Der Preis war
--    eine zweite, bedeutungslose Bezeichnung für dieselbe Sache — im
--    Adminbereich, in den E-Mails und im Freelancer-Workspace. Projekte
--    heißen ab jetzt überall so, wie ihr Kunde sie genannt hat.
--
-- 3. KEINE REFERENZNUMMERN MEHR (NM-2026-0001)
--
--    Ein Lead ist durch Name, E-Mail und Telefonnummer eindeutig. Die
--    zusätzliche Nummer stand in jeder Tabelle vorne und trug nichts bei.

ALTER TABLE `projects` ADD COLUMN `claimed_by` TEXT REFERENCES `freelancers`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `claimed_at` INTEGER;
--> statement-breakpoint
-- Bestehende Zuordnungen übernehmen: die ÄLTESTE gewinnt, denn genau so
-- entscheidet die neue Regel auch — wer zuerst da war, hat den Job.
UPDATE `projects` SET
  `claimed_by` = (SELECT `a`.`freelancer_id` FROM `assignments` `a` WHERE `a`.`project_id` = `projects`.`id` ORDER BY `a`.`created_at` LIMIT 1),
  `claimed_at` = (SELECT `a`.`created_at` FROM `assignments` `a` WHERE `a`.`project_id` = `projects`.`id` ORDER BY `a`.`created_at` LIMIT 1);
--> statement-breakpoint
DROP INDEX IF EXISTS `assignments_pair_unique`;
--> statement-breakpoint
DROP INDEX IF EXISTS `assignments_freelancer_idx`;
--> statement-breakpoint
DROP TABLE `assignments`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `projects_claimed_idx` ON `projects` (`claimed_by`);
--> statement-breakpoint
-- Die Codenamen. Der eindeutige Index muss vor der Spalte weg — SQLite
-- verweigert DROP COLUMN, solange ein Index auf der Spalte liegt.
DROP INDEX IF EXISTS `projects_codename_unique`;
--> statement-breakpoint
ALTER TABLE `projects` DROP COLUMN `codename`;
--> statement-breakpoint
DROP INDEX IF EXISTS `customers_codename_unique`;
--> statement-breakpoint
ALTER TABLE `customers` DROP COLUMN `codename`;
--> statement-breakpoint
DROP INDEX IF EXISTS `leads_reference_unique`;
--> statement-breakpoint
ALTER TABLE `leads` DROP COLUMN `reference_no`;
