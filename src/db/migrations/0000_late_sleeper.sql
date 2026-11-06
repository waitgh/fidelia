CREATE TABLE `batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`closed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_batches_date` ON `batches` (`date`);--> statement-breakpoint
CREATE INDEX `idx_batches_status` ON `batches` (`status`);--> statement-breakpoint
CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE TABLE `donors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`email` text,
	`phone` text,
	`address` text,
	`city` text,
	`state` text,
	`zip_code` text,
	`envelope_number` text,
	`notes` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `donors_envelope_number_unique` ON `donors` (`envelope_number`);--> statement-breakpoint
CREATE INDEX `idx_donors_name` ON `donors` (`last_name`,`first_name`);--> statement-breakpoint
CREATE INDEX `idx_donors_envelope` ON `donors` (`envelope_number`);--> statement-breakpoint
CREATE TABLE `offerings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`donor_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`amount` real NOT NULL,
	`payment_method` text NOT NULL,
	`check_number` text,
	`notes` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	`updated_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`donor_id`) REFERENCES `donors`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_offerings_batch` ON `offerings` (`batch_id`);--> statement-breakpoint
CREATE INDEX `idx_offerings_donor` ON `offerings` (`donor_id`);--> statement-breakpoint
CREATE INDEX `idx_offerings_category` ON `offerings` (`category_id`);--> statement-breakpoint
CREATE INDEX `idx_offerings_payment_method` ON `offerings` (`payment_method`);