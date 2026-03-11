ALTER TABLE `users` ADD `googleAccessToken` text;--> statement-breakpoint
ALTER TABLE `users` ADD `googleRefreshToken` text;--> statement-breakpoint
ALTER TABLE `users` ADD `googleTokenExpiry` bigint;