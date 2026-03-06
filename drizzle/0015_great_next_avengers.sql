ALTER TABLE `tasks` ADD `repeatType` enum('none','weekly','monthly') DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeatDayOfWeek` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeatDayOfMonth` int;--> statement-breakpoint
ALTER TABLE `tasks` ADD `repeatParentId` int;