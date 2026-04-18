CREATE TABLE `visitSlotOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`dateKey` varchar(10) NOT NULL,
	`slotsJson` mediumtext NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `visitSlotOrders_id` PRIMARY KEY(`id`)
);
