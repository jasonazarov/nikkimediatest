-- Zwei Änderungen an der Hierarchie:
--
-- 1. Ein Lead ist kein Kunde. Wer sich einträgt, bekommt einen Arbeitsbereich
--    (Zeile in `customers`), erscheint im Adminbereich unter „Kunden“ aber
--    erst, wenn Jason ihn ausdrücklich dazu erklärt. `converted_at` hält
--    fest, wann das passiert ist — NULL heißt: noch kein Kunde.
--
-- 2. Ordner hängen ab jetzt immer an einem Projekt. Der Kunde legt zuerst ein
--    Projekt an und darin beliebig viele Ordner. Der Index bedient genau
--    diese Abfrage (Ordner eines Projekts auf einer Ebene, ohne Papierkorb).

ALTER TABLE customers ADD COLUMN converted_at INTEGER;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `folders_project_idx` ON `folders` (`project_id`,`parent_id`,`deleted_at`);
