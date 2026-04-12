CREATE TABLE `attendance_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` enum('clock_in','clock_out') NOT NULL,
	`userId` int NOT NULL,
	`userName` varchar(100) NOT NULL,
	`clockedAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_logs_id` PRIMARY KEY(`id`)
);
