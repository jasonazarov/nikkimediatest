-- Warum ein Projekt keinen Veröffentlichungskanal bekommen hat.
--
-- Der Anlass: vier Projekte angelegt, nur zwei bekamen einen Kanal. Der Grund
-- stand ausschließlich in den Worker-Logs — "Social sets limit reached.
-- Limit is 3 sets." —, also an einer Stelle, an die im Alltag niemand schaut.
-- Aufgefallen ist es erst durch Nachzählen beim Anbieter.
--
-- Für fertige Videos galt von Anfang an: ein Clip, der NICHT rausgeht, muss
-- genauso sichtbar sein wie einer, der rausgeht. Für Kanäle fehlte dasselbe.
-- Diese beiden Spalten holen das nach; die Adminansicht zeigt sie an.
--
-- NULL in bundle_error heißt: kein Fehler bekannt. Entweder hat der Kanal
-- geklappt (dann steht er in bundle_teams) oder es wurde noch nichts versucht
-- (dann ist auch bundle_tried_at NULL).

ALTER TABLE `projects` ADD COLUMN `bundle_error` TEXT;
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `bundle_tried_at` INTEGER;
