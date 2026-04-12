CREATE TABLE `alcohol_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('clock_in','clock_out') NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(100) NOT NULL,
	`numberPlate` varchar(20) NOT NULL DEFAULT '',
	`confirmMethod` enum('online','face') NOT NULL DEFAULT 'online',
	`detectorUsed` tinyint NOT NULL DEFAULT 1,
	`alcoholDetected` tinyint NOT NULL DEFAULT 0,
	`confirmerName` varchar(100) NOT NULL DEFAULT '森脇崇',
	`notes` text,
	`checkedAt` bigint NOT NULL,
	`sheetSynced` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alcohol_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `users` ADD `numberPlate` varchar(20) DEFAULT '';