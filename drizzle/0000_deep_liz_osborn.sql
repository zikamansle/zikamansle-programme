CREATE TABLE `push_config` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_deliveries` (
	`message` text NOT NULL,
	`subscription` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`code` integer,
	PRIMARY KEY(`message`, `subscription`)
);
--> statement-breakpoint
CREATE TABLE `push_notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`url` text NOT NULL,
	`created` integer NOT NULL,
	`test` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `push_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`endpoint` text NOT NULL,
	`p256dh` text NOT NULL,
	`auth` text NOT NULL,
	`created` integer NOT NULL,
	`ip` text NOT NULL
);
