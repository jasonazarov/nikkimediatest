-- Creator — Influencer und UGC-Creator — kommen als vierte Rolle dazu.
--
-- Ein Creator kann zweierlei: Kampagnen SUCHEN (dieselben Aufträge, die
-- auch die Clipper sehen — wer zuerst annimmt, bekommt sie) und Kampagnen
-- HABEN (eigenes Rohmaterial oder Cloud-Links hochladen, die die Clipper
-- dann abarbeiten). Beides läuft über dieselben Tabellen wie bei Kunden und
-- Clippern, deshalb bekommt ein Creator beim Eintrag zusätzlich je eine
-- Zeile in `customers` (sein Arbeitsbereich für eigene Kampagnen) und in
-- `clippers` (damit er Kampagnen annehmen kann). Hier steht nur, was ihn
-- als Creator beschreibt: seine Angaben aus dem Stepper auf /creator.
--
-- Die Rolle selbst ist ein Wert in `users.role` ('creator') — dafür braucht
-- es keine Änderung am Schema, die Spalte ist Text.

CREATE TABLE `creators` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`goal` text NOT NULL,
	`platforms` text NOT NULL,
	`open_to_ads` text NOT NULL,
	`followers` text NOT NULL,
	`views_total` text NOT NULL,
	`views_30d` text NOT NULL,
	`handles` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_user_unique` ON `creators` (`user_id`);
