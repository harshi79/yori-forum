CREATE TABLE `post_edits` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`editor_id` text,
	`previous_body` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`editor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `post_edits_post_idx` ON `post_edits` (`post_id`);--> statement-breakpoint
CREATE TABLE `reports` (
	`id` text PRIMARY KEY NOT NULL,
	`reporter_id` text NOT NULL,
	`thread_id` text,
	`post_id` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` text,
	`resolved_at` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`reporter_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`thread_id`) REFERENCES `threads`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`resolved_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "reports_target_check" CHECK(("reports"."thread_id" is not null and "reports"."post_id" is null) or ("reports"."thread_id" is null and "reports"."post_id" is not null)),
	CONSTRAINT "reports_status_check" CHECK("reports"."status" in ('open', 'resolved', 'dismissed'))
);
--> statement-breakpoint
CREATE INDEX `reports_status_created_idx` ON `reports` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `reports_reporter_idx` ON `reports` (`reporter_id`);--> statement-breakpoint
ALTER TABLE `categories` ADD `archived_at` integer;--> statement-breakpoint
ALTER TABLE `posts` ADD `edited_at` integer;--> statement-breakpoint
ALTER TABLE `threads` ADD `view_count` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `threads` ADD `last_activity_at` integer DEFAULT (unixepoch()) NOT NULL;--> statement-breakpoint
ALTER TABLE `threads` ADD `archived_at` integer;--> statement-breakpoint
CREATE INDEX `threads_activity_idx` ON `threads` (`category_id`,`last_activity_at`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_reactions` (
	`user_id` text NOT NULL,
	`post_id` text NOT NULL,
	`kind` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	PRIMARY KEY(`user_id`, `post_id`, `kind`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "reactions_kind_check" CHECK("__new_reactions"."kind" in ('like', 'heart', 'insightful'))
);
--> statement-breakpoint
INSERT INTO `__new_reactions`("user_id", "post_id", "kind", "created_at") SELECT "user_id", "post_id", "kind", "created_at" FROM `reactions`;--> statement-breakpoint
DROP TABLE `reactions`;--> statement-breakpoint
ALTER TABLE `__new_reactions` RENAME TO `reactions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `reactions_post_idx` ON `reactions` (`post_id`);