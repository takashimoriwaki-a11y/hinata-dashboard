CREATE TABLE `shared_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`aiTool` varchar(100) NOT NULL DEFAULT 'Gemini',
	`category` varchar(100),
	`createdBy` int NOT NULL,
	`createdByName` varchar(100) NOT NULL,
	`updatedByName` varchar(100),
	`isDeleted` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shared_prompts_id` PRIMARY KEY(`id`)
);
