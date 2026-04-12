CREATE TABLE `alcohol_check_spreadsheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`spreadsheetId` varchar(100) NOT NULL,
	`label` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alcohol_check_spreadsheets_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `alcohol_checks` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('clock_in','clock_out') NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(100) NOT NULL,
	`numberPlate` varchar(20) NOT NULL DEFAULT '',
	`confirmMethod` enum('online','face') NOT NULL DEFAULT 'online',
	`detectorUsed` tinyint NOT NULL DEFAULT 1,
	`alcoholDetected` tinyint NOT NULL DEFAULT 0,
	`confirmerName` varchar(100) NOT NULL DEFAULT '森脇崇',
	`notes` text,
	`checkedAt` bigint NOT NULL,
	`clockInAt` bigint,
	`clockOutAt` bigint,
	`overtimeStartAt` bigint,
	`overtimeEndAt` bigint,
	`overtimeReason` text,
	`latitude` double,
	`longitude` double,
	`locationAddress` text,
	`sheetSynced` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `alcohol_checks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('clock_in','clock_out') NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(100) NOT NULL,
	`clockedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_logs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `shared_prompts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(200) NOT NULL,
	`body` text NOT NULL,
	`aiTool` varchar(100) NOT NULL DEFAULT 'Gemini',
	`category` varchar(100),
	`createdBy` int NOT NULL,
	`createdByName` varchar(100) NOT NULL,
	`updatedByName` varchar(100),
	`usageNotes` text,
	`isDeleted` tinyint NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shared_prompts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `schedule_comments` MODIFY COLUMN `day` enum('今日','明日','2日後','3日後','4日後') NOT NULL;--> statement-breakpoint
ALTER TABLE `schedule_screenshots` MODIFY COLUMN `day` enum('今日','明日','2日後','3日後','4日後') NOT NULL;--> statement-breakpoint
ALTER TABLE `screenshot_upload_logs` MODIFY COLUMN `day` enum('今日','明日','2日後','3日後','4日後') NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `numberPlate` varchar(20) DEFAULT '';