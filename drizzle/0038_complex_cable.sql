CREATE TABLE `tool_audit_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` enum('create','update','delete') NOT NULL,
	`toolType` enum('team','common') NOT NULL,
	`team` varchar(50),
	`category` varchar(100),
	`toolLabel` varchar(200) NOT NULL,
	`toolHref` varchar(2000),
	`previousLabel` varchar(200),
	`operatedBy` int NOT NULL,
	`operatedByName` varchar(100) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `tool_audit_logs_id` PRIMARY KEY(`id`)
);
