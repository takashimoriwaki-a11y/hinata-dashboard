ALTER TABLE `personal_tasks` MODIFY COLUMN `assignTeam` enum('身体','天理','郡山北部','郡山南部','事務員');--> statement-breakpoint
ALTER TABLE `personal_tasks` ADD `assignTeams` text;--> statement-breakpoint
ALTER TABLE `personal_tasks` ADD `assignUserIds` text;--> statement-breakpoint
ALTER TABLE `personal_tasks` ADD `assignUserNames` text;