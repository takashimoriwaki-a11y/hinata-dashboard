CREATE TABLE `overtime_approvals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`applicantUserId` int NOT NULL,
	`applicantName` varchar(100) NOT NULL,
	`applicationDate` varchar(10) NOT NULL,
	`requestedStartAt` bigint NOT NULL,
	`requestedEndAt` bigint NOT NULL,
	`requestedReason` text,
	`status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
	`approverUserId` int,
	`approverName` varchar(100),
	`approvedAt` bigint,
	`adjustedStartAt` bigint,
	`adjustedEndAt` bigint,
	`approverComment` text,
	`sheetSynced` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `overtime_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `timesheet_spreadsheets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`year` int NOT NULL,
	`month` int NOT NULL,
	`spreadsheetId` varchar(200) NOT NULL,
	`spreadsheetUrl` text NOT NULL,
	`label` varchar(200) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `timesheet_spreadsheets_id` PRIMARY KEY(`id`)
);
