ALTER TABLE `social_accounts` ADD `creator_name` text;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `email` text;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `deal_type` text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `fixed_fee` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `cpm_rate` real DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `deal_currency` text DEFAULT 'USD' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `tracking_hashtags` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `tracking_keywords` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `tracking_match` text DEFAULT 'any' NOT NULL;
--> statement-breakpoint
ALTER TABLE `creator_videos` ADD `thumbnail_url` text;
