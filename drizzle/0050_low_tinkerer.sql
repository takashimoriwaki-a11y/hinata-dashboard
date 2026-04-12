CREATE TABLE `monthly_signatures` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(100) NOT NULL,
	`targetYear` int NOT NULL,
	`targetMonth` int NOT NULL,
	`signedAt` bigint NOT NULL,
	`comment` text,
	`adminConfirmed` tinyint NOT NULL DEFAULT 0,
	`adminConfirmerName` varchar(100),
	`adminConfirmedAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `monthly_signatures_id` PRIMARY KEY(`id`)
);
