-- „Wie bist du auf uns aufmerksam geworden?“ auch im Formular der Startseite
-- (Kunden-Leads) und auf /creator, wie schon bei den Agenturen (Vorgabe des
-- Auftraggebers, November 2026). Werte aus AGENCY_SOURCES (lib/agency.ts):
-- ads | chatgpt | google | empfehlung. NULL bei älteren Einträgen.
ALTER TABLE leads ADD COLUMN source TEXT;
ALTER TABLE creators ADD COLUMN source TEXT;
