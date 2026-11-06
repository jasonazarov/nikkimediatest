-- Laufzeit einer Kampagne aus dem Formular „Neue Kampagne“ im Kunden-Dashboard
-- (Vorgabe des Auftraggebers, November 2026): 30, 60 oder 90 Tage. Die gewünschte
-- Reichweite steht wie bei Agenturen in briefing_views. Nur eine neue, leere Spalte:
-- bestehende Kampagnen bleiben unverändert.
ALTER TABLE projects ADD COLUMN briefing_duration_days INTEGER;
