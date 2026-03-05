CREATE TABLE `spreadsheet_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`linkKey` varchar(100) NOT NULL,
	`label` varchar(100) NOT NULL,
	`yearMonth` varchar(7) NOT NULL,
	`url` text NOT NULL,
	`createdBy` int,
	`color` varchar(50) DEFAULT 'text-emerald-600',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `spreadsheet_links_id` PRIMARY KEY(`id`)
);
