CREATE TABLE `accident_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` enum('医療事故・虚待','ヒヤリハット・アクシデント') NOT NULL,
	`label` varchar(200) NOT NULL,
	`href` text NOT NULL,
	`description` varchar(500) DEFAULT '',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `accident_links_id` PRIMARY KEY(`id`)
);
