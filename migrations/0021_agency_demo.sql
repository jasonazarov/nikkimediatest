-- Demo-Konto der Agenturen (Oktober 2026, Vorgabe des Auftraggebers).
--
-- 1 = Demo-Konto („theguardians“): Das Collaboration-Dashboard zeigt nur
-- erfundene Zahlen und Listen aus src/lib/demo.ts (nichts davon steht in der
-- Datenbank), das Konto ist schreibgeschützt und meldet sich mit E-Mail und
-- Passwort unter /login/demo an. Angelegt wird es mit
-- `node scripts/demo-account.mjs`.
ALTER TABLE agency_leads ADD COLUMN demo INTEGER NOT NULL DEFAULT 0;
