ALTER TABLE `push_notifications` ADD `media` text;--> statement-breakpoint
ALTER TABLE `push_notifications` ADD `archived` integer DEFAULT 0 NOT NULL;