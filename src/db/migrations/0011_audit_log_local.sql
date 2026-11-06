CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` text DEFAULT (datetime('now')) NOT NULL,
	`username` text NOT NULL,
	`action` text NOT NULL,
	`resource` text,
	`resource_id` integer,
	`detail` text
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_at` ON `audit_log` (`at`);