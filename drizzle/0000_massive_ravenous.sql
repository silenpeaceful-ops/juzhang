CREATE TABLE `ledger_configuration` (
	`owner_id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`encrypted_credential` text,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`report_day` text NOT NULL,
	`provider` text NOT NULL,
	`status` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`error` text,
	`sent_at` text
);
--> statement-breakpoint
CREATE TABLE `ledger_metadata` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ledger_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`day` text NOT NULL,
	`occurred_at` text NOT NULL,
	`status` text NOT NULL,
	`payload` text NOT NULL,
	`event_key` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `transactions_owner_day` ON `ledger_transactions` (`owner_id`,`day`);--> statement-breakpoint
CREATE INDEX `transactions_event_key` ON `ledger_transactions` (`owner_id`,`event_key`);