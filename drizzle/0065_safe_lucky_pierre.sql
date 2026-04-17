ALTER TABLE `personal_tasks` MODIFY COLUMN `assignTeam` enum('身体','天理','郡山北部','郡山南部');--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin') NOT NULL DEFAULT 'user';--> statement-breakpoint
ALTER TABLE `personal_tasks` DROP COLUMN `assignTeams`;--> statement-breakpoint
ALTER TABLE `personal_tasks` DROP COLUMN `assignUserIds`;--> statement-breakpoint
ALTER TABLE `personal_tasks` DROP COLUMN `assignUserNames`;--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `nameKana`;