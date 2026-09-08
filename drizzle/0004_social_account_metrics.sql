ALTER TABLE `social_accounts` ADD `followers` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `posts` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `views` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `avg_views` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `likes` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `comments` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `shares` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `favorites` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `engagement_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `social_accounts` ADD `last_error` text;
