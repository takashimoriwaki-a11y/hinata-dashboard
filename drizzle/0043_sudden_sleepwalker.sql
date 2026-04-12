ALTER TABLE `alcohol_checks` ADD `alcoholMeasuredValue` varchar(10);--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `detectorType` varchar(100);--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `drivingPurpose` enum('visit','transport','errand','other') DEFAULT 'visit';--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `hasPassenger` tinyint DEFAULT 0;--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `passengerCount` int;--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `physicalCondition` enum('good','poor') DEFAULT 'good';--> statement-breakpoint
ALTER TABLE `alcohol_checks` ADD `physicalConditionNote` text;