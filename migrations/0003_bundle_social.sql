-- Anbindung an bundle.social — Veröffentlichung fertiger Clips.
--
-- Der Ablauf, den diese Tabellen tragen:
--   Projekt entsteht  ->  Team bei bundle.social entsteht  ->  Jason hängt dort
--   die Social-Accounts ein  ->  ein fertiger Clip geht beim Upload sofort an
--   alle Accounts dieses Projekts.
--
-- Ein Projekt hat 1..n Teams, nicht genau eines. Ob ein Team mehrere
-- Instagram-Accounts halten kann, entscheidet sich erst mit echten Accounts.
-- Die Liste macht die Frage für den Code bedeutungslos: bei einem Team hat sie
-- einen Eintrag, bei mehreren eben mehrere, und der Versand läuft in beiden
-- Fällen als Schleife.

CREATE TABLE IF NOT EXISTS `bundle_teams` (
  `id` TEXT PRIMARY KEY NOT NULL,
  `project_id` TEXT NOT NULL REFERENCES `projects`(`id`) ON DELETE cascade,
  `bundle_team_id` TEXT NOT NULL,
  `created_at` INTEGER NOT NULL
);
--> statement-breakpoint
-- Dasselbe Team darf nicht zweimal an einem Projekt hängen. Ohne diese Sperre
-- würde ein wiederholter Nachhol-Lauf des Cron dieselbe Verbindung doppeln und
-- jeder Clip ginge doppelt raus.
CREATE UNIQUE INDEX IF NOT EXISTS `bundle_teams_pair_unique`
  ON `bundle_teams` (`project_id`,`bundle_team_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bundle_teams_project_idx`
  ON `bundle_teams` (`project_id`);
--> statement-breakpoint

-- Spiegel der bei bundle.social verbundenen Accounts. Reine Anzeige — die
-- Wahrheit steht immer drüben. Gefüllt wird sie über die Webhooks
-- social-account.* und über einen Abgleich beim Öffnen der Adminseite.
CREATE TABLE IF NOT EXISTS `bundle_accounts` (
  `bundle_account_id` TEXT PRIMARY KEY NOT NULL,
  `bundle_team_id` TEXT NOT NULL,
  `project_id` TEXT NOT NULL REFERENCES `projects`(`id`) ON DELETE cascade,
  `type` TEXT NOT NULL,
  `username` TEXT,
  `display_name` TEXT,
  `updated_at` INTEGER NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bundle_accounts_project_idx`
  ON `bundle_accounts` (`project_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `bundle_accounts_team_idx`
  ON `bundle_accounts` (`bundle_team_id`);
--> statement-breakpoint

-- Der Veröffentlichungsstand je fertigem Video.
--
-- bundle_post_status trägt bewusst auch die Fälle, in denen NICHTS gesendet
-- wurde: ein Clip, der wegen seines Formats oder fehlender Accounts liegen
-- bleibt, muss sichtbar sein. Still verschlucken wäre das Schlimmste — dann
-- glaubt der Freelancer, sein Video sei online.
ALTER TABLE `deliverables` ADD COLUMN `bundle_upload_id` TEXT;
--> statement-breakpoint
ALTER TABLE `deliverables` ADD COLUMN `bundle_post_id` TEXT;
--> statement-breakpoint
ALTER TABLE `deliverables` ADD COLUMN `bundle_post_status` TEXT;
--> statement-breakpoint
ALTER TABLE `deliverables` ADD COLUMN `bundle_error` TEXT;
--> statement-breakpoint
-- Zweite Sperre gegen Doppelposts: ruft der Browser /uploads/complete zweimal
-- auf, schlägt der zweite Schreibversuch derselben Post-ID hier auf.
-- (Die erste Sperre ist der referenceKey drüben bei bundle.social.)
CREATE UNIQUE INDEX IF NOT EXISTS `deliverables_bundle_post_unique`
  ON `deliverables` (`bundle_post_id`);
