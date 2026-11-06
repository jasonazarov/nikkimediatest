-- Anbieterwechsel: bundle.social raus, Zernio rein.
--
-- Der Grund steckt in einem einzigen Feld. bundle.social adressierte einen
-- Post über PLATTFORMNAMEN (`socialAccountTypes: ["TIKTOK"]`). Ein Name kann
-- nur auf einen Account zeigen, also hielt ein Team dort genau einen Account
-- je Plattform — und zehn Instagram-Accounts eines Kunden brauchten zehn
-- Teams und zehn getrennte Veröffentlichungen.
--
-- Zernio adressiert ACCOUNT-IDs. Ein Aufruf trägt beliebig viele Ziele, auch
-- mehrere derselben Plattform. Damit verschwindet die Schleife über Teams,
-- und mit ihr die halb veröffentlichten Zwischenstände, die niemand
-- zusammenhalten konnte.
--
-- Die neuen Namen sind ANBIETERNEUTRAL (`publish_*` statt `zernio_*`). Beim
-- nächsten Wechsel bleibt das Schema, wie es ist — genau das hat diesmal
-- gefehlt.

-- --------------------------------------------------------------- Projekte

ALTER TABLE `projects` RENAME COLUMN `bundle_error` TO `publish_error`;
ALTER TABLE `projects` RENAME COLUMN `bundle_tried_at` TO `publish_tried_at`;

-- ------------------------------------------------------------- Deliverable

ALTER TABLE `deliverables` RENAME COLUMN `bundle_post_id` TO `publish_post_id`;
ALTER TABLE `deliverables` RENAME COLUMN `bundle_post_status` TO `publish_status`;
ALTER TABLE `deliverables` RENAME COLUMN `bundle_error` TO `publish_error`;

-- Der Inhalt ändert seine Bedeutung, nicht nur den Namen: Schlüssel war der
-- Plattformname, künftig ist es die Account-ID. Fünf TikTok-Accounts in
-- einem Post lassen sich unter einem Schlüssel "TIKTOK" nicht auseinander-
-- halten — genau daran wäre die Anzeige sonst gescheitert.
ALTER TABLE `deliverables` RENAME COLUMN `bundle_platforms` TO `publish_targets`;

-- Die Upload-ID der Gegenseite entfällt ersatzlos: Zernio holt die Datei
-- selbst von der signierten R2-Adresse, es gibt keinen Zwischenschritt mehr.
ALTER TABLE `deliverables` DROP COLUMN `bundle_upload_id`;

DROP INDEX IF EXISTS `deliverables_bundle_post_unique`;
CREATE UNIQUE INDEX `deliverables_publish_post_unique` ON `deliverables` (`publish_post_id`);

-- Altbestand: die gespeicherten Werte zeigen auf Post-IDs bei bundle.social,
-- die es für uns nicht mehr gibt. Stehen sie stehen, hielte der Code die
-- Videos für erledigt und würde sie nie erneut senden. Also zurücksetzen —
-- der tägliche Lauf nimmt sie danach von allein wieder auf.
UPDATE `deliverables`
   SET `publish_post_id` = NULL,
       `publish_status` = NULL,
       `publish_error` = NULL,
       `publish_targets` = NULL;

UPDATE `projects`
   SET `publish_error` = NULL,
       `publish_tried_at` = NULL;

-- ------------------------------------------------------------ Neue Tabellen

DROP TABLE IF EXISTS `bundle_accounts`;
DROP TABLE IF EXISTS `bundle_teams`;

-- Ein Profil je Steckplatz.
--
-- Zernio erlaubt pro Profil nur EINEN Account je Plattform. Für den zweiten
-- TikTok-Account eines Projekts legen wir deshalb ein zweites Profil an.
-- `slot` ist die laufende Nummer je Projekt und Plattform und macht den
-- Namen drüben lesbar ("Müller · Reels · tiktok 2").
--
-- Das ist reine Verkabelung. Veröffentlicht wird über Account-IDs, die
-- Zernio teamweit prüft — nie über ein Profil.
CREATE TABLE `publish_profiles` (
  `id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE cascade,
  `provider_profile_id` text NOT NULL,
  `platform` text NOT NULL,
  `slot` integer NOT NULL DEFAULT 1,
  `created_at` integer NOT NULL
);

CREATE UNIQUE INDEX `publish_profiles_provider_unique` ON `publish_profiles` (`provider_profile_id`);
CREATE UNIQUE INDEX `publish_profiles_slot_unique` ON `publish_profiles` (`project_id`, `platform`, `slot`);
CREATE INDEX `publish_profiles_project_idx` ON `publish_profiles` (`project_id`);

-- Spiegel der verbundenen Accounts. Die Wahrheit steht drüben; diese Tabelle
-- spart den API-Aufruf beim Rendern und liefert die Ziele für den Versand.
CREATE TABLE `publish_accounts` (
  `provider_account_id` text PRIMARY KEY NOT NULL,
  `project_id` text NOT NULL REFERENCES `projects`(`id`) ON DELETE cascade,
  `provider_profile_id` text NOT NULL,
  `platform` text NOT NULL,
  `username` text,
  `display_name` text,
  `updated_at` integer NOT NULL
);

CREATE INDEX `publish_accounts_project_idx` ON `publish_accounts` (`project_id`);
CREATE INDEX `publish_accounts_profile_idx` ON `publish_accounts` (`provider_profile_id`);

-- Eine Account-Gruppe je Projekt. Sie fasst alle Accounts eines Kunden
-- profilübergreifend zusammen und macht das Dashboard der Gegenseite lesbar.
-- Für den Versand ist sie nicht nötig; scheitert sie, passiert nichts weiter.
CREATE TABLE `publish_groups` (
  `project_id` text PRIMARY KEY NOT NULL REFERENCES `projects`(`id`) ON DELETE cascade,
  `provider_group_id` text NOT NULL,
  `updated_at` integer NOT NULL
);

-- Webhook-Ereignisse kommen mindestens einmal, gern auch zweimal. Ohne diese
-- Sperre würde ein wiederholtes Ereignis denselben Zustand ein zweites Mal
-- verarbeiten.
CREATE TABLE `publish_events` (
  `event_id` text PRIMARY KEY NOT NULL,
  `received_at` integer NOT NULL
);

CREATE INDEX `publish_events_received_idx` ON `publish_events` (`received_at`);
