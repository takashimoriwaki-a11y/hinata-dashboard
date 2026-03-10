CREATE TABLE `voice_feedback` (
	`id` int AUTO_INCREMENT NOT NULL,
	`originalText` text NOT NULL,
	`transcribedResult` text,
	`wrongField` varchar(200),
	`wrongValue` text,
	`correctValue` text,
	`comment` text,
	`reportedBy` int NOT NULL,
	`reportedByName` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `voice_feedback_id` PRIMARY KEY(`id`)
);
