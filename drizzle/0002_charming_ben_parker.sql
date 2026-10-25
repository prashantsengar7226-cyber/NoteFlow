CREATE TABLE `billing_events` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`processed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `billing_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`key_mode` text NOT NULL,
	`provider_order_id` text,
	`payment_id` text,
	`state` text DEFAULT 'creating' NOT NULL,
	`amount` integer NOT NULL,
	`currency` text DEFAULT 'INR' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `billing_provider_order` ON `billing_orders` (`provider_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_payment` ON `billing_orders` (`payment_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `billing_active_account` ON `billing_orders` (`owner`,`key_mode`) WHERE "billing_orders"."state" in ('creating','created','paid');--> statement-breakpoint
CREATE INDEX `billing_owner_created` ON `billing_orders` (`owner`,`created_at`);