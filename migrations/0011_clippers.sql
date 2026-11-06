-- Wer Jobs annimmt und fertige Clips abliefert, heißt ab jetzt überall
-- „Clipper" — in der Oberfläche, in den Mails, im Code und hier in der
-- Datenbank. Die alte Bezeichnung steht nur noch in den Migrationen davor,
-- die als Historie unverändert bleiben.
--
-- Nichts geht verloren: ALTER TABLE … RENAME behält jede Zeile, und SQLite
-- schreibt dabei die REFERENCES-Klauseln der anderen Tabellen
-- (`projects.claimed_by`, `deliverables.clipper_id`) automatisch mit um.

ALTER TABLE `freelancers` RENAME TO `clippers`;
--> statement-breakpoint
ALTER TABLE `deliverables` RENAME COLUMN `freelancer_id` TO `clipper_id`;
--> statement-breakpoint
DROP INDEX IF EXISTS `freelancers_user_idx`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `clippers_user_idx` ON `clippers` (`user_id`);
--> statement-breakpoint
DROP INDEX IF EXISTS `deliverables_freelancer_idx`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `deliverables_clipper_idx` ON `deliverables` (`clipper_id`);
--> statement-breakpoint
-- Die Rolle am Konto. Bestehende Sitzungen bleiben gültig — sie hängen an
-- der Nutzer-ID, nicht an der Rolle (siehe `currentUser` in lib/auth.ts).
UPDATE `users` SET `role` = 'clipper' WHERE `role` = 'freelancer';
