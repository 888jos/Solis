ALTER TABLE `campaigns` ADD `goal` text DEFAULT 'Downloads' NOT NULL;
--> statement-breakpoint
ALTER TABLE `campaigns` ADD `notes` text;
--> statement-breakpoint
ALTER TABLE `creatives` ADD `social_account_id` text REFERENCES `social_accounts`(`id`);
--> statement-breakpoint
ALTER TABLE `creatives` ADD `hook` text;
--> statement-breakpoint
ALTER TABLE `creatives` ADD `angle` text DEFAULT 'Demo' NOT NULL;
--> statement-breakpoint
ALTER TABLE `creatives` ADD `likes` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `creatives` ADD `comments` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `creatives` ADD `shares` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `creatives` ADD `favorites` integer DEFAULT 0 NOT NULL;
