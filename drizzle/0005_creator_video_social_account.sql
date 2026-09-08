ALTER TABLE `creator_videos` ADD `social_account_id` text REFERENCES `social_accounts`(`id`);
--> statement-breakpoint
CREATE INDEX `creator_videos_social_account_idx` ON `creator_videos` (`social_account_id`);
