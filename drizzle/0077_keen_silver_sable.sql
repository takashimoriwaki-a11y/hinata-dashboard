CREATE TABLE `schedule_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`screenshotId` int NOT NULL,
	`content` text NOT NULL,
	`updatedBy` int NOT NULL,
	`updatedByName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `schedule_notes_id` PRIMARY KEY(`id`)
);
