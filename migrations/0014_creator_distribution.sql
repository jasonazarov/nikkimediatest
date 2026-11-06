-- Creator verbinden ihre Social-Accounts selbst und verbreiten Kampagnen.
--
-- 1. ACCOUNTS GEHÖREN JETZT EINEM PROJEKT ODER EINEM CREATOR
--
--    Bisher hing jeder verbundene Account an genau einem Projekt. Ein Creator
--    verbindet seine Accounts aber einmal für sich — sie gelten für alle seine
--    eigenen Kampagnen ebenso wie für Kunden-Kampagnen, die er verbreitet.
--    Je Kampagne neu zu verbinden hieße doppelte Kosten: abgerechnet wird je
--    verbundenem Account und Monat. `publish_profiles` und `publish_accounts`
--    bekommen deshalb neben `project_id` ein `creator_id`; genau eins von
--    beiden ist gesetzt (CHECK).
--
--    SQLite kann eine NOT-NULL-Spalte nicht nachträglich lockern. Beide
--    Tabellen werden darum neu aufgebaut: neue Tabelle, Zeilen übernehmen,
--    alte ersetzen. Nichts geht verloren, und kein anderes Objekt verweist
--    per Fremdschlüssel auf diese beiden Tabellen.
--
--    `defer_foreign_keys` verschiebt die Prüfung der Fremdschlüssel ans Ende
--    der Migration. D1 erzwingt Fremdschlüssel immer; ohne den Aufschub
--    könnte der Umbau an einer Zwischenstufe scheitern, die am Ende gar
--    nicht mehr besteht.
--
-- 2. KUNDEN GEBEN KAMPAGNEN FÜR CREATOR FREI
--
--    `projects.creator_distribution`: Der Kunde (oder der Administrator)
--    erlaubt, dass die fertigen Clips zusätzlich über Creator-Accounts laufen.
--    Standard ist aus — ohne Zustimmung landet nichts auf fremden Kanälen.
--
-- 3. WER VERBREITET WAS
--
--    `campaign_creators`: welche Creator eine freigegebene Kampagne verbreiten
--    (beliebig viele je Kampagne).
--
--    `clip_approvals`: je Clip und Creator die Freigabe — erst nach dem Klick
--    auf „Freigeben & posten“ geht ein Kunden-Clip auf seine Kanäle. Die Zeile
--    trägt ihren EIGENEN Veröffentlichungsstand (`publish_*`, Aufbau wie am
--    Deliverable). Der Stand am Deliverable bleibt damit unberührt, und mit
--    ihm jede Sperre gegen Doppelposts, die dort hängt.
--    `manual_posts` hält für Plattformen ohne automatisches Posten (Twitch,
--    Snapchat) den Link zum Beitrag fest, als JSON { plattform: url }.

PRAGMA defer_foreign_keys = on;
--> statement-breakpoint
CREATE TABLE `publish_profiles_new` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`creator_id` text,
	`provider_profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`slot` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `publish_profiles_owner_check` CHECK ((`project_id` IS NULL) <> (`creator_id` IS NULL))
);
--> statement-breakpoint
INSERT INTO `publish_profiles_new` (`id`, `project_id`, `creator_id`, `provider_profile_id`, `platform`, `slot`, `created_at`)
  SELECT `id`, `project_id`, NULL, `provider_profile_id`, `platform`, `slot`, `created_at` FROM `publish_profiles`;
--> statement-breakpoint
DROP TABLE `publish_profiles`;
--> statement-breakpoint
ALTER TABLE `publish_profiles_new` RENAME TO `publish_profiles`;
--> statement-breakpoint
CREATE UNIQUE INDEX `publish_profiles_provider_unique` ON `publish_profiles` (`provider_profile_id`);
--> statement-breakpoint
CREATE UNIQUE INDEX `publish_profiles_slot_unique` ON `publish_profiles` (`project_id`,`platform`,`slot`);
--> statement-breakpoint
CREATE UNIQUE INDEX `publish_profiles_creator_slot_unique` ON `publish_profiles` (`creator_id`,`platform`,`slot`);
--> statement-breakpoint
CREATE INDEX `publish_profiles_project_idx` ON `publish_profiles` (`project_id`);
--> statement-breakpoint
CREATE INDEX `publish_profiles_creator_idx` ON `publish_profiles` (`creator_id`);
--> statement-breakpoint
CREATE TABLE `publish_accounts_new` (
	`provider_account_id` text PRIMARY KEY NOT NULL,
	`project_id` text,
	`creator_id` text,
	`provider_profile_id` text NOT NULL,
	`platform` text NOT NULL,
	`username` text,
	`display_name` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `publish_accounts_owner_check` CHECK ((`project_id` IS NULL) <> (`creator_id` IS NULL))
);
--> statement-breakpoint
INSERT INTO `publish_accounts_new` (`provider_account_id`, `project_id`, `creator_id`, `provider_profile_id`, `platform`, `username`, `display_name`, `updated_at`)
  SELECT `provider_account_id`, `project_id`, NULL, `provider_profile_id`, `platform`, `username`, `display_name`, `updated_at` FROM `publish_accounts`;
--> statement-breakpoint
DROP TABLE `publish_accounts`;
--> statement-breakpoint
ALTER TABLE `publish_accounts_new` RENAME TO `publish_accounts`;
--> statement-breakpoint
CREATE INDEX `publish_accounts_project_idx` ON `publish_accounts` (`project_id`);
--> statement-breakpoint
CREATE INDEX `publish_accounts_creator_idx` ON `publish_accounts` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `publish_accounts_profile_idx` ON `publish_accounts` (`provider_profile_id`);
--> statement-breakpoint
ALTER TABLE `projects` ADD COLUMN `creator_distribution` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE `campaign_creators` (
	`project_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`joined_at` integer NOT NULL,
	PRIMARY KEY (`project_id`, `creator_id`),
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `campaign_creators_creator_idx` ON `campaign_creators` (`creator_id`);
--> statement-breakpoint
CREATE TABLE `clip_approvals` (
	`deliverable_id` text NOT NULL,
	`creator_id` text NOT NULL,
	`status` text NOT NULL,
	`publish_status` text,
	`publish_error` text,
	`publish_targets` text,
	`publish_post_ids` text,
	`manual_posts` text,
	`decided_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	PRIMARY KEY (`deliverable_id`, `creator_id`),
	FOREIGN KEY (`deliverable_id`) REFERENCES `deliverables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clip_approvals_creator_idx` ON `clip_approvals` (`creator_id`);
--> statement-breakpoint
CREATE INDEX `clip_approvals_publish_idx` ON `clip_approvals` (`publish_status`);
