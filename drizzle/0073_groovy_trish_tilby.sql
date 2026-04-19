ALTER TABLE `schedule_changes` MODIFY COLUMN `changeType` enum('visit_change','visit_cancel','visit_add','meeting_add','meeting_change','schedule_visit','schedule_short_stay','schedule_special_instruction','schedule_hospitalization','schedule_discharge','schedule_new_contract','schedule_visit_doctor') NOT NULL;--> statement-breakpoint
ALTER TABLE `schedule_changes` ADD `scheduleFacility` varchar(200);--> statement-breakpoint
ALTER TABLE `schedule_changes` ADD `scheduleStartDate` varchar(30);--> statement-breakpoint
ALTER TABLE `schedule_changes` ADD `scheduleEndDate` varchar(30);--> statement-breakpoint
ALTER TABLE `schedule_changes` ADD `schedulePostDischargeEndDate` varchar(30);--> statement-breakpoint
ALTER TABLE `schedule_changes` ADD `scheduleTargetName` varchar(200);--> statement-breakpoint
ALTER TABLE `schedule_changes` ADD `scheduleStaff` text;