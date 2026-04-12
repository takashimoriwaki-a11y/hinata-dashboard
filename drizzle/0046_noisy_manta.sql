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
ALTER TABLE `alcohol_checks` ADD `clockInAt` bigint;--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `clockOutAt` bigint;--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `overtimeStartAt` bigint;--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `overtimeEndAt` bigint;--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `overtimeReason` text;