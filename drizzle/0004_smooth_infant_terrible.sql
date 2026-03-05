CREATE TABLE `tasks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`text` text NOT NULL,
	`done` int NOT NULL DEFAULT 0,
	`category` varchar(50) NOT NULL DEFAULT 'その他',
	`dueDate` timestamp,
	`createdBy` int NOT NULL,
	`createdByName` text NOT NULL,
	`assignType` enum('all','team','personal') NOT NULL DEFAULT 'all',
	`assignTeam` enum('身体','天理','郡山北部','郡山南部'),
	`assignUserId` int,
	`assignUserName` text,
	`completedBy` int,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `tasks_id` PRIMARY KEY(`id`)
);
