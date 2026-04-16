CREATE TABLE `improvement_spreadsheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`spreadsheetId` varchar(200) NOT NULL,
	`spreadsheetUrl` text NOT NULL,
	`label` varchar(200) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `improvement_spreadsheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `improvement_suggestions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`createdBy` int NOT NULL,
	`createdByName` varchar(100) NOT NULL,
	`category` enum('業務効率化','コミュニケーション','環境・設備','ケアの質向上','その他') NOT NULL DEFAULT 'その他',
	`content` text NOT NULL,
	`isAnonymous` tinyint NOT NULL DEFAULT 0,
	`sheetSynced` int NOT NULL DEFAULT 0,
	`adminReply` text,
	`adminReplierName` varchar(100),
	`adminRepliedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `improvement_suggestions_id` PRIMARY KEY(`id`)
);
