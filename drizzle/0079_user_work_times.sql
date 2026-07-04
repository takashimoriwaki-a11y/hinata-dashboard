ALTER TABLE `users` ADD `workStartTime` varchar(5) NULL;
ALTER TABLE `users` ADD `workEndTime` varchar(5) NULL;

UPDATE `users`
SET `workStartTime` = '08:30',
    `workEndTime` = '17:00'
WHERE REPLACE(REPLACE(COALESCE(`name`, ''), ' ', ''), '　', '') NOT IN ('森脇崇', '森脇英樹');

UPDATE `users`
SET `workStartTime` = '08:30',
    `workEndTime` = '16:00'
WHERE `name` LIKE '%河内%';

UPDATE `users`
SET `workStartTime` = NULL,
    `workEndTime` = NULL
WHERE REPLACE(REPLACE(COALESCE(`name`, ''), ' ', ''), '　', '') IN ('森脇崇', '森脇英樹');
