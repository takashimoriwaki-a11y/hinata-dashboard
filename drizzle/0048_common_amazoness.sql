CREATE TABLE `alcohol_detector_settings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`modelNumber` varchar(100),
	`manufacturer` varchar(100),
	`isActive` tinyint NOT NULL DEFAULT 1,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `alcohol_detector_settings_id` PRIMARY KEY(`id`)
);
