CREATE TABLE `team_goals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team` enum('身体','天理','郡山北部','郡山南部','全チーム') NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text,
	`startDate` date,
	`endDate` date,
	`createdBy` int NOT NULL,
	`createdByName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `team_goals_id` PRIMARY KEY(`id`)
);
