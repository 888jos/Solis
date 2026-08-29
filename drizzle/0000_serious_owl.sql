CREATE TABLE `app_store_credentials` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text NOT NULL,
	`credential_preset` text,
	`key_id` text,
	`issuer_id` text,
	`private_key_secret_ref` text,
	`vendor_number` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_validated_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `app_store_credentials_app_idx` ON `app_store_credentials` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `app_store_credentials_app_unique` ON `app_store_credentials` (`app_id`);--> statement-breakpoint
CREATE TABLE `apps` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`display_name` text,
	`platform` text DEFAULT 'ios' NOT NULL,
	`bundle_id` text,
	`app_store_id` text,
	`sku` text,
	`developer_name` text,
	`artwork_url` text,
	`primary_currency` text DEFAULT 'USD' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`deleted_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `apps_workspace_idx` ON `apps` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `apps_workspace_app_store_unique` ON `apps` (`workspace_id`,`app_store_id`);--> statement-breakpoint
CREATE TABLE `aso_keyword_snapshots` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`keyword_id` text NOT NULL,
	`date` text NOT NULL,
	`popularity` integer,
	`difficulty` integer,
	`position` integer,
	`trend` integer,
	`apps_count` integer,
	`top_app_ids_json` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`keyword_id`) REFERENCES `aso_keywords`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aso_keyword_snapshots_unique` ON `aso_keyword_snapshots` (`keyword_id`,`date`);--> statement-breakpoint
CREATE TABLE `aso_keywords` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text NOT NULL,
	`country_code` text NOT NULL,
	`keyword` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `aso_keywords_unique` ON `aso_keywords` (`app_id`,`country_code`,`keyword`);--> statement-breakpoint
CREATE TABLE `campaigns` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text,
	`name` text NOT NULL,
	`channel` text DEFAULT 'creator' NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`budget` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`starts_at` text,
	`ends_at` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `campaigns_workspace_status_idx` ON `campaigns` (`workspace_id`,`status`);--> statement-breakpoint
CREATE TABLE `creatives` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`campaign_id` text,
	`app_id` text,
	`name` text NOT NULL,
	`format` text DEFAULT 'video' NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`url` text,
	`spend` real DEFAULT 0 NOT NULL,
	`impressions` integer DEFAULT 0 NOT NULL,
	`clicks` integer DEFAULT 0 NOT NULL,
	`installs` integer DEFAULT 0 NOT NULL,
	`revenue` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `creatives_campaign_idx` ON `creatives` (`campaign_id`);--> statement-breakpoint
CREATE TABLE `creator_videos` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`creator_id` text,
	`campaign_id` text,
	`app_id` text,
	`platform` text NOT NULL,
	`url` text,
	`title` text,
	`published_at` text,
	`cost` real DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`favorites` integer DEFAULT 0 NOT NULL,
	`attributed_installs` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`creator_id`) REFERENCES `creators`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `creator_videos_campaign_idx` ON `creator_videos` (`campaign_id`);--> statement-breakpoint
CREATE INDEX `creator_videos_creator_idx` ON `creator_videos` (`creator_id`);--> statement-breakpoint
CREATE TABLE `creators` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`name` text NOT NULL,
	`handle` text,
	`platform` text,
	`email` text,
	`status` text DEFAULT 'prospect' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `creators_workspace_handle_unique` ON `creators` (`workspace_id`,`platform`,`handle`);--> statement-breakpoint
CREATE TABLE `daily_app_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text NOT NULL,
	`date` text NOT NULL,
	`country_code` text DEFAULT 'WW' NOT NULL,
	`source` text NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`gross_revenue` real DEFAULT 0 NOT NULL,
	`proceeds` real DEFAULT 0 NOT NULL,
	`refunds` real DEFAULT 0 NOT NULL,
	`installs` integer DEFAULT 0 NOT NULL,
	`paid_units` integer DEFAULT 0 NOT NULL,
	`trials` integer DEFAULT 0 NOT NULL,
	`cancellations` integer DEFAULT 0 NOT NULL,
	`subscribers` integer DEFAULT 0 NOT NULL,
	`mrr` real DEFAULT 0 NOT NULL,
	`arpu` real DEFAULT 0 NOT NULL,
	`expenses` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `daily_app_metrics_app_date_idx` ON `daily_app_metrics` (`app_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_app_metrics_unique` ON `daily_app_metrics` (`app_id`,`date`,`country_code`,`source`);--> statement-breakpoint
CREATE TABLE `daily_briefs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`date` text NOT NULL,
	`summary` text NOT NULL,
	`risks_json` text DEFAULT '[]' NOT NULL,
	`actions_json` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `daily_briefs_workspace_date_unique` ON `daily_briefs` (`workspace_id`,`date`);--> statement-breakpoint
CREATE TABLE `daily_social_metrics` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`social_account_id` text NOT NULL,
	`date` text NOT NULL,
	`source` text NOT NULL,
	`posts` integer DEFAULT 0 NOT NULL,
	`views` integer DEFAULT 0 NOT NULL,
	`likes` integer DEFAULT 0 NOT NULL,
	`comments` integer DEFAULT 0 NOT NULL,
	`shares` integer DEFAULT 0 NOT NULL,
	`favorites` integer DEFAULT 0 NOT NULL,
	`attributed_installs` integer DEFAULT 0 NOT NULL,
	`engagement_rate` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`social_account_id`) REFERENCES `social_accounts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `daily_social_metrics_account_date_idx` ON `daily_social_metrics` (`social_account_id`,`date`);--> statement-breakpoint
CREATE UNIQUE INDEX `daily_social_metrics_unique` ON `daily_social_metrics` (`social_account_id`,`date`,`source`);--> statement-breakpoint
CREATE TABLE `manual_expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text,
	`category` text NOT NULL,
	`label` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'USD' NOT NULL,
	`spent_at` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `manual_expenses_workspace_date_idx` ON `manual_expenses` (`workspace_id`,`spent_at`);--> statement-breakpoint
CREATE TABLE `social_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text NOT NULL,
	`platform` text NOT NULL,
	`handle` text NOT NULL,
	`tracking_mode` text DEFAULT 'public_handle' NOT NULL,
	`source` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `social_accounts_app_idx` ON `social_accounts` (`app_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `social_accounts_unique_handle` ON `social_accounts` (`workspace_id`,`platform`,`handle`);--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text,
	`provider` text NOT NULL,
	`kind` text NOT NULL,
	`date_range` text,
	`status` text DEFAULT 'queued' NOT NULL,
	`records_read` integer DEFAULT 0 NOT NULL,
	`records_written` integer DEFAULT 0 NOT NULL,
	`message` text,
	`error` text,
	`started_at` integer,
	`finished_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sync_jobs_workspace_status_idx` ON `sync_jobs` (`workspace_id`,`status`);--> statement-breakpoint
CREATE INDEX `sync_jobs_provider_idx` ON `sync_jobs` (`provider`,`kind`);--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`owner_email` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workspaces_slug_unique` ON `workspaces` (`slug`);