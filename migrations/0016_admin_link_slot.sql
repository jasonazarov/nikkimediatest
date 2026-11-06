-- Wer den Link für einen Steckplatz zuletzt erzeugt hat: der Administrator?
--
-- Die Obergrenze für verbundene Accounts (50 je Kunde, 10 je Creator) gilt
-- für das, was Kunde und Creator selbst verbinden. Der Administrator
-- verbindet für Projekte darüber hinaus. Ankommen kann ein Account aber auf
-- drei Wegen — Rückkehr im Browser, Webhook, Abgleich —, und nur die
-- Rückkehr weiß, wer verbunden hat. Fehlte sie, ließ sich ein Kunde mit 49
-- Accounts über zwei vorab geöffnete Links auf 51 bringen (nachgestellt),
-- weil der Webhook an Projekt-Steckplätzen den Administrator nicht
-- ausbremsen durfte.
--
-- Deshalb steht es jetzt am Steckplatz: der Link des Administrators setzt
-- den Zeitpunkt, der Link von Kunde oder Creator löscht ihn. Ein Account in
-- einem so markierten Steckplatz zählt nie als „über der Grenze“.
-- Bestehende Steckplätze bleiben leer (NULL); die Grenze prüft ohnehin nur
-- NEU ankommende Accounts.

ALTER TABLE publish_profiles ADD COLUMN admin_link_at INTEGER;
