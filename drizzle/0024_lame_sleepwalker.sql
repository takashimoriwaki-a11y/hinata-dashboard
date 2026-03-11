CREATE TABLE `team_tools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team` enum('身体','天理','郡山北部','郡山南部') NOT NULL,
	`label` varchar(200) NOT NULL,
	`href` varchar(2000) NOT NULL,
	`emoji` varchar(10) NOT NULL DEFAULT '🔗',
	`color` varchar(100) NOT NULL DEFAULT 'text-blue-600',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_tools_id` PRIMARY KEY(`id`)
);
