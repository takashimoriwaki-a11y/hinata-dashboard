ALTER TABLE `schedule_comments` MODIFY COLUMN `day` enum('今日','明日','3日後','4日後') NOT NULL;--> statement-breakpoint
ALTER TABLE `schedule_screenshots` MODIFY COLUMN `day` enum('今日','明日','3日後','4日後') NOT NULL;--> statement-breakpoint
ALTER TABLE `screenshot_upload_logs` MODIFY COLUMN `day` enum('今日','明日','3日後','4日後') NOT NULL;