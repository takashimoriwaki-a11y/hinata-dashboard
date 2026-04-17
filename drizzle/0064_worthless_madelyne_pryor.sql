ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','super_admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `users` ADD `nameKana` varchar(100) DEFAULT '';