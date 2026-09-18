CREATE TABLE `boards_new` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `name` text NOT NULL DEFAULT 'My board',
  `creator_type` text NOT NULL,
  `created_at` text NOT NULL DEFAULT '1970-01-01T00:00:00.000Z',
  FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `boards_new` (`id`, `user_id`, `name`, `creator_type`, `created_at`)
  SELECT `id`, `user_id`, 'My board', `creator_type`, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  FROM `boards`;--> statement-breakpoint
DROP TABLE `boards`;--> statement-breakpoint
ALTER TABLE `boards_new` RENAME TO `boards`;--> statement-breakpoint
CREATE INDEX `boards_user_idx` ON `boards` (`user_id`);