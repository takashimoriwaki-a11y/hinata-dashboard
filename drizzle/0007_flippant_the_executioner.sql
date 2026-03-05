CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(100) NOT NULL,
	`team` enum('身体','天理','郡山北部','郡山南部') NOT NULL,
	`nameKana` varchar(100),
	`active` int NOT NULL DEFAULT 1,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `visit_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int NOT NULL,
	`patientName` text NOT NULL,
	`team` enum('身体','天理','郡山北部','郡山南部') NOT NULL,
	`createdBy` int NOT NULL,
	`createdByName` text NOT NULL,
	`clinicalNotes` text,
	`nextVisitAt` timestamp,
	`notifiedTo` enum('本人','家族','その他'),
	`notifiedToOther` text,
	`notifyMethod` enum('口頭','カレンダー記入','付箋','電話','その他'),
	`notifyMethodOther` text,
	`exportedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `visit_records_id` PRIMARY KEY(`id`)
);
