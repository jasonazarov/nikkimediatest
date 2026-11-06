-- „Kampagne pushen“-Popup je Kunde bzw. Agentur einstellbar (Vorgabe des
-- Auftraggebers, November 2026): alle wie viele Tage es erscheint.
-- NULL = Standard (7 Tage), 0 = aus. Siehe lib/upsell.ts und Admin-Abschnitt „Push popup“.
ALTER TABLE customers ADD COLUMN push_popup_days INTEGER;
