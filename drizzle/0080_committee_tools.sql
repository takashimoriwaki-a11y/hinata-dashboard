CREATE TABLE `committee_tools` (
	`id` int AUTO_INCREMENT NOT NULL,
	`committee` enum('業務改善委員','安全対策委員','権利擁護委員','感染対策委員','教育委員') NOT NULL,
	`label` varchar(200) NOT NULL,
	`href` varchar(2000) NOT NULL,
	`emoji` varchar(10) NOT NULL DEFAULT '🔗',
	`color` varchar(100) NOT NULL DEFAULT 'text-blue-600',
	`sortOrder` int NOT NULL DEFAULT 0,
	`imageData` mediumtext,
	`imageType` varchar(50),
	`imageName` varchar(255),
	`createdBy` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `committee_tools_id` PRIMARY KEY(`id`)
);
