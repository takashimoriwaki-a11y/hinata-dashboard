CREATE TABLE `quick_access_links` (
	`id` int AUTO_INCREMENT NOT NULL,
	`category` enum('スプレッドシート','ドキュメント','フォーム','その他') NOT NULL,
	`label` varchar(200) NOT NULL,
	`href` varchar(2000) NOT NULL,
	`color` varchar(100) NOT NULL DEFAULT 'text-blue-600',
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `quick_access_links_id` PRIMARY KEY(`id`)
);
