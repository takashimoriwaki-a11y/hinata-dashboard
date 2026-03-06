CREATE TABLE `schedule_comments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team` enum('身体','天理','郡山北部','郡山南部') NOT NULL,
	`day` enum('今日','明日') NOT NULL,
	`content` text NOT NULL,
	`userId` int NOT NULL,
	`userName` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_comments_id` PRIMARY KEY(`id`)
);
