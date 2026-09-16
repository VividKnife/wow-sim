CREATE TABLE `game_receipts` (
	`user_id` text NOT NULL,
	`request_id` text NOT NULL,
	`revision` integer NOT NULL,
	`fingerprint` text NOT NULL,
	PRIMARY KEY(`user_id`, `request_id`)
);
