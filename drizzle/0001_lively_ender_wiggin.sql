CREATE TABLE `schedule_screenshots` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team` enum('身体','天理','郡山北部','郡山南部') NOT NULL,
	`day` enum('今日','明日') NOT NULL,
	`imageUrl` text NOT NULL,
	`imageKey` varchar(512) NOT NULL,
	`uploadedBy` int,
	`uploadedByName` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_screenshots_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `team` enum('身体','天理','郡山北部','郡山南部') DEFAULT '身体';