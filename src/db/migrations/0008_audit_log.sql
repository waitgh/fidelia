CREATE TABLE IF NOT EXISTS `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer,
	`username` text NOT NULL,
	`action` text NOT NULL,
	`resource` text,
	`resource_id` integer,
	`detail` text,
	`ip` text,
	`created_at` text DEFAULT (datetime('now')) NOT NULL
);
CREATE INDEX IF NOT EXISTS `idx_audit_created_at` ON `audit_logs` (`created_at`);
CREATE INDEX IF NOT EXISTS `idx_audit_username` ON `audit_logs` (`username`);
