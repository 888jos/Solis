CREATE TABLE `integration_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`app_id` text,
	`provider` text NOT NULL,
	`status` text DEFAULT 'needs_configuration' NOT NULL,
	`config_json` text DEFAULT '{}' NOT NULL,
	`secret_ref` text,
	`last_synced_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`app_id`) REFERENCES `apps`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `integration_connections_workspace_idx` ON `integration_connections` (`workspace_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `integration_connections_unique` ON `integration_connections` (`workspace_id`,`app_id`,`provider`);