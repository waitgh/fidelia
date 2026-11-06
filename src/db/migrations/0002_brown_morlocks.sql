CREATE TABLE `pledges` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donor_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`amount` real NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`donor_id`) REFERENCES `donors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_pledges_donor` ON `pledges` (`donor_id`);--> statement-breakpoint
CREATE INDEX `idx_pledges_category` ON `pledges` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_pledges_dates` ON `pledges` (`start_date`,`end_date`);