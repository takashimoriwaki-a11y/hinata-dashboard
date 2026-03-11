CREATE TABLE `minutes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(300) NOT NULL,
	`content` mediumtext NOT NULL,
	`createdBy` int NOT NULL,
	`createdByName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `minutes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `minutes_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`minutesId` int NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(100) NOT NULL,
	`checkedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `minutes_checks_id` PRIMARY KEY(`id`)
);
