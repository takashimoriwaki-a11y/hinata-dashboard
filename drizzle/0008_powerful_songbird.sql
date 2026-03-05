CREATE TABLE `app_notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('schedule_updated','task_today','new_message') NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text,
	`resourceId` int,
	`isRead` int NOT NULL DEFAULT 0,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `app_notifications_id` PRIMARY KEY(`id`)
);
