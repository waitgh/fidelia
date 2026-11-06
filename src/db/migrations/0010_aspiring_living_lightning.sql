CREATE TABLE `statement_emails` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`donor_id` integer NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`email` text NOT NULL,
	`status` text NOT NULL,
	`error` text,
	`sent_by` text NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`donor_id`) REFERENCES `donors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_statement_emails_donor_period` ON `statement_emails` (`donor_id`,`period_start`,`period_end`);