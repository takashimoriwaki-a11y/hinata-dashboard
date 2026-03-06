CREATE TABLE `screenshot_upload_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`team` enum('身体','天理','郡山北部','郡山南部') NOT NULL,
	`day` enum('今日','明日') NOT NULL,
	`uploadedBy` int,
	`uploadedByName` varchar(200),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `screenshot_upload_logs_id` PRIMARY KEY(`id`)
);
