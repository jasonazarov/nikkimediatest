-- In welcher Nische ein Creator tätig ist — dieselbe Frage (und dieselbe
-- Auswahlliste INDUSTRIES aus domain.ts) wie im Stepper der Kunden-Startseite.
--
-- Bestehende Creator haben die Frage nie gesehen und bleiben leer (NULL).
-- Neue Selbsteinträge über /creator setzen sie immer.

ALTER TABLE creators ADD COLUMN niche TEXT;
