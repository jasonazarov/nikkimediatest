-- Nikki Media — Initiales Schema
-- Anwenden:  npx wrangler d1 migrations apply nikki-media --remote

CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`role` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text,
	`created_at` integer NOT NULL,
	`last_login_at` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
CREATE TABLE `login_codes` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`code_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`used_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `login_codes_email_idx` ON `login_codes` (`email`,`created_at`);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token_hash`);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);
--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company` text,
	`codename` text NOT NULL,
	`storage_bytes` integer DEFAULT 0 NOT NULL,
	`storage_warned_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_codename_unique` ON `customers` (`codename`);
--> statement-breakpoint
CREATE INDEX `customers_user_idx` ON `customers` (`user_id`);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` text PRIMARY KEY NOT NULL,
	`reference_no` text NOT NULL,
	`full_name` text NOT NULL,
	`company` text,
	`email` text NOT NULL,
	`phone` text NOT NULL,
	`platforms` text NOT NULL,
	`industry` text NOT NULL,
	`footage_amount` text NOT NULL,
	`budget_range` text NOT NULL,
	`status` text DEFAULT 'neu' NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	`customer_id` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `leads_reference_unique` ON `leads` (`reference_no`);
--> statement-breakpoint
CREATE INDEX `leads_status_idx` ON `leads` (`status`,`created_at`);
--> statement-breakpoint
CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`name` text NOT NULL,
	`codename` text NOT NULL,
	`status` text DEFAULT 'aktiv' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `projects_codename_unique` ON `projects` (`codename`);
--> statement-breakpoint
CREATE INDEX `projects_customer_idx` ON `projects` (`customer_id`);
--> statement-breakpoint
CREATE TABLE `freelancers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`display_name` text NOT NULL,
	`status` text DEFAULT 'eingeladen' NOT NULL,
	`invited_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `freelancers_user_idx` ON `freelancers` (`user_id`);
--> statement-breakpoint
CREATE TABLE `assignments` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`freelancer_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`freelancer_id`) REFERENCES `freelancers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assignments_pair_unique` ON `assignments` (`project_id`,`freelancer_id`);
--> statement-breakpoint
CREATE INDEX `assignments_freelancer_idx` ON `assignments` (`freelancer_id`);
--> statement-breakpoint
CREATE TABLE `folders` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`project_id` text,
	`name` text NOT NULL,
	`parent_id` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `folders_customer_idx` ON `folders` (`customer_id`,`parent_id`,`deleted_at`);
--> statement-breakpoint
CREATE TABLE `raw_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`folder_id` text NOT NULL,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`mime` text,
	`upload_status` text DEFAULT 'pending' NOT NULL,
	`upload_parts` text,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`folder_id`) REFERENCES `folders`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `raw_assets_folder_idx` ON `raw_assets` (`folder_id`,`deleted_at`);
--> statement-breakpoint
CREATE INDEX `raw_assets_status_idx` ON `raw_assets` (`upload_status`);
--> statement-breakpoint
CREATE TABLE `deliverables` (
	`id` text PRIMARY KEY NOT NULL,
	`project_id` text NOT NULL,
	`freelancer_id` text,
	`r2_key` text NOT NULL,
	`filename` text NOT NULL,
	`caption` text,
	`thumbnail_key` text,
	`seen_by_customer` integer DEFAULT 0 NOT NULL,
	`bytes` integer DEFAULT 0 NOT NULL,
	`upload_status` text DEFAULT 'pending' NOT NULL,
	`upload_parts` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`project_id`) REFERENCES `projects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`freelancer_id`) REFERENCES `freelancers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `deliverables_project_idx` ON `deliverables` (`project_id`,`created_at`);
--> statement-breakpoint
CREATE INDEX `deliverables_freelancer_idx` ON `deliverables` (`freelancer_id`);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text,
	`payload` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_created_idx` ON `audit_log` (`created_at`);
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`id` text PRIMARY KEY NOT NULL,
	`bucket` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	`window_start` integer NOT NULL,
	`blocked_until` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_bucket_unique` ON `rate_limits` (`bucket`);
