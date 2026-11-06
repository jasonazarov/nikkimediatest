-- Drei Erweiterungen, die zusammen ausgeliefert werden.
--
-- 1. CLIPPER TRAGEN SICH SELBST EIN
--
--    Bisher kam ein Clipper nur über eine Einladung des Administrators ins
--    System. Ab jetzt gibt es zusätzlich /clipper: Wer das Formular dort
--    ausfüllt, bekommt einen Zugang und landet nach der Bestätigung seiner
--    Adresse per Code in seinem Dashboard.
--    Was er dabei angegeben hat, liegt hier — eingeladene Clipper haben
--    keine Zeile, sie haben das Formular nie gesehen.
--
-- 2. CLOUD-LINKS AN PROJEKTEN
--
--    Nicht jeder hat sein Rohmaterial auf dem Gerät, an dem er gerade sitzt:
--    der eine hat es am Handy, der andere am Rechner, der dritte in einem
--    Google-Drive-Ordner. Ein Link zu so einem Ordner zählt deshalb genauso
--    als Material wie eine hochgeladene Datei — mit ihm wird ein Projekt zum
--    Job, den die Clipper sehen und annehmen können.

CREATE TABLE `clipper_applications` (
	`id` text PRIMARY KEY NOT NULL,
	`clipper_id` text NOT NULL,
	`platforms` text NOT NULL,
	`work_status` text NOT NULL,
	`experience` text NOT NULL,
	`availability` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`clipper_id`) REFERENCES `clippers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `clipper_applications_clipper_idx` ON `clipper_applications` (`clipper_id`,`created_at`);
--> statement-breakpoint
CREATE TABLE `project_links` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`url` text NOT NULL,
	`added_by` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`added_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `project_links_project_idx` ON `project_links` (`project_id`,`created_at`);
--> statement-breakpoint
-- 3. E-MAIL-NACHWEIS
--
--    Ein Selbsteintrag kann eine Sitzung bekommen, bevor jemand bewiesen hat,
--    dass ihm die Adresse gehört. `verified_at` hält fest, wann der erste
--    Login mit Code (oder Passwort) gelang. In diesem Moment werden alle
--    älteren Sitzungen des Kontos verworfen — wer eine fremde Adresse vorab
--    eingetragen hat, verliert damit seinen Zugang, sobald der echte Inhaber
--    sich meldet (siehe `completeLogin` in routes/auth.ts).
--
--    Bestehende Konten gelten als nachgewiesen: Sie sind über Einladung,
--    Code-Login oder den Administrator entstanden.
ALTER TABLE `users` ADD COLUMN `verified_at` INTEGER;
--> statement-breakpoint
UPDATE `users` SET `verified_at` = COALESCE(`last_login_at`, `created_at`);
