CREATE TABLE `my_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`label` varchar(100) NOT NULL,
	`url` text NOT NULL,
	`emoji` varchar(10) DEFAULT '🔗',
	`description` varchar(200),
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `my_links_id` PRIMARY KEY(`id`)
);
