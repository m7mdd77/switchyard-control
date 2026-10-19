CREATE TABLE `attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `attempts_at` ON `attempts` (`at`);--> statement-breakpoint
CREATE TABLE `service` (
	`id` integer PRIMARY KEY NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`csrf` text NOT NULL,
	`touched` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`team` text NOT NULL,
	`rev` integer NOT NULL,
	`state` text NOT NULL,
	`touched` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `ws_touched` ON `workspaces` (`touched`);