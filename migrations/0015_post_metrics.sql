-- Echte Zahlen aus Zernio: Views, Likes, Kommentare, Shares je Post und Account.
--
-- 1. DIE ZAHLEN (`post_metrics`)
--
--    Eine Zeile je Zernio-Post UND Account. Ein Post geht an alle Accounts
--    einer Plattform gleichzeitig (fünf TikToks in einem Aufruf), und jeder
--    davon zählt für sich — deshalb ist der Schlüssel das Paar, nicht der Post.
--
--    `creator_id` trennt die beiden Wege, auf denen ein Clip rausgeht:
--    NULL = automatische Ziele des Projekts (Stand am Deliverable), gesetzt =
--    Verbreitung über genau diesen Creator (Stand in `clip_approvals`). Die
--    Kampagnen-Summen zeigen beides, die Seite eines Creators nur seins.
--
--    `project_id` steht doppelt (auch am Deliverable): die Projektlisten
--    summieren über alle Projekte eines Kunden, und das soll eine gruppierte
--    Abfrage über EINE Tabelle sein statt eines Joins je Seitenaufruf.
--
--    Der zusammengesetzte Fremdschlüssel auf `clip_approvals` greift nur bei
--    gesetztem `creator_id` (SQLite prüft einen zusammengesetzten Schlüssel
--    mit NULL-Anteil nicht). Verschwindet eine Freigabe, verschwinden ihre
--    Zahlen mit — sonst zählten Posts weiter, zu denen es keinen Stand mehr gibt.
--
-- 2. DER ZEITPLAN (`metrics_sync`)
--
--    Eine Zeile je Zernio-Post: wann er zuletzt und wann er wieder abgefragt
--    wird. Junge Clips ändern sich stündlich, alte kaum noch — ein Abruf je
--    Post und Viertelstunde wäre bei hunderten Clips schnell am Rate-Limit
--    der Gegenseite (60 Abrufe je Minute bei bis zu zwei Accounts).
--    `published_at` ist die Uhr für diesen Zeitplan; `status` sagt, was der
--    letzte Abruf ergab ('pending' = Zernio synchronisiert noch, 'failed' =
--    auf allen Plattformen gescheitert, 'unknown' = Zernio kennt den Post nicht).
--
--    Zwei Zähler, weil sie verschiedene Abstände steuern: `tries` zählt
--    202-Antworten in Folge (wie lange noch stündlich nachgefragt wird),
--    `errors` zählt Fehler in Folge (5xx, Netz — 30 Minuten, dann doppelt so
--    lang). In EINEM Zähler wartete der erste 5xx nach zwölf 202ern einen Tag.
--
--    `leased_until` hält einen Post für den Lauf, der ihn gerade abfragt —
--    eine eigene Spalte statt `next_at`, damit auch der Admin-Knopf sie sieht:
--    er fragt ohne Rücksicht auf den Zeitplan und übersah die Belegung des
--    Crons, also gingen dieselben Posts zweimal hinaus.
--
-- 3. ZUSTAND (`app_state`)
--
--    Ein Schlüssel-Wert-Speicher für einzelne Zustände ohne eigene Tabelle.
--    Erster Eintrag: `metrics_paused_until`. Antwortet Zernio mit 402 (der
--    Plan enthält keine Analytics), ruht der Abgleich 24 Stunden — statt alle
--    fünfzehn Minuten vierzig Abrufe gegen dieselbe Wand zu schicken.

CREATE TABLE `post_metrics` (
	`post_id` text NOT NULL,
	`account_id` text NOT NULL,
	`deliverable_id` text NOT NULL,
	`creator_id` text,
	`project_id` text NOT NULL,
	`platform` text NOT NULL,
	`username` text,
	`url` text,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`saves` integer DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`reach` integer DEFAULT 0 NOT NULL,
	`synced_at` integer NOT NULL,
	PRIMARY KEY (`post_id`, `account_id`),
	FOREIGN KEY (`deliverable_id`) REFERENCES `deliverables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deliverable_id`, `creator_id`) REFERENCES `clip_approvals`(`deliverable_id`, `creator_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_metrics_deliverable_idx` ON `post_metrics` (`deliverable_id`);
--> statement-breakpoint
CREATE INDEX `post_metrics_project_idx` ON `post_metrics` (`project_id`);
--> statement-breakpoint
CREATE INDEX `post_metrics_creator_idx` ON `post_metrics` (`creator_id`);
--> statement-breakpoint
CREATE TABLE `metrics_sync` (
	`post_id` text PRIMARY KEY NOT NULL,
	`deliverable_id` text NOT NULL,
	`creator_id` text,
	`project_id` text NOT NULL,
	`platform` text,
	`published_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`next_at` integer NOT NULL,
	`tries` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`last_at` integer,
	`leased_until` integer,
	FOREIGN KEY (`deliverable_id`) REFERENCES `deliverables`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`deliverable_id`, `creator_id`) REFERENCES `clip_approvals`(`deliverable_id`, `creator_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `metrics_sync_due_idx` ON `metrics_sync` (`next_at`);
--> statement-breakpoint
CREATE INDEX `metrics_sync_project_idx` ON `metrics_sync` (`project_id`);
--> statement-breakpoint
CREATE INDEX `metrics_sync_deliverable_idx` ON `metrics_sync` (`deliverable_id`);
--> statement-breakpoint
CREATE INDEX `metrics_sync_creator_idx` ON `metrics_sync` (`creator_id`);
--> statement-breakpoint
CREATE TABLE `app_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_at` integer NOT NULL
);
