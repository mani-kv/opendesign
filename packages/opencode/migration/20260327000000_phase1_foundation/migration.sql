-- Phase 1: Fix FK chain and consolidate ProjectTable into ProductTable
-- Accepts data loss

DROP TABLE IF EXISTS `todo`;--> statement-breakpoint
DROP TABLE IF EXISTS `permission`;--> statement-breakpoint
DROP TABLE IF EXISTS `variation`;--> statement-breakpoint
DROP TABLE IF EXISTS `checkpoint`;--> statement-breakpoint
DROP TABLE IF EXISTS `part`;--> statement-breakpoint
DROP TABLE IF EXISTS `message`;--> statement-breakpoint
DROP TABLE IF EXISTS `agent`;--> statement-breakpoint
DROP TABLE IF EXISTS `annotation`;--> statement-breakpoint
DROP TABLE IF EXISTS `feature`;--> statement-breakpoint
DROP TABLE IF EXISTS `product_design_system`;--> statement-breakpoint
DROP TABLE IF EXISTS `design_system`;--> statement-breakpoint
DROP TABLE IF EXISTS `product`;--> statement-breakpoint
DROP TABLE IF EXISTS `project`;--> statement-breakpoint
DROP TABLE IF EXISTS `session`;--> statement-breakpoint
DROP TABLE IF EXISTS `workspace`;--> statement-breakpoint
DROP TABLE IF EXISTS `session_share`;--> statement-breakpoint
DROP TABLE IF EXISTS `session_canvas`;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `product` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`directory` text NOT NULL,
	`worktree` text NOT NULL,
	`git_root` text,
	`icon` text,
	`commands` text,
	`sandboxes` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `design_system` (
	`id` text PRIMARY KEY,
	`name` text NOT NULL,
	`figma_file_key` text,
	`figma_file_name` text,
	`tokens` text,
	`components` text,
	`styles` text,
	`last_synced_at` integer,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `product_design_system` (
	`product_id` text NOT NULL,
	`design_system_id` text NOT NULL,
	PRIMARY KEY(`product_id`, `design_system_id`),
	CONSTRAINT `fk_product_design_system_product_id` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_product_design_system_design_system_id` FOREIGN KEY (`design_system_id`) REFERENCES `design_system`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `feature` (
	`id` text PRIMARY KEY,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`branch` text NOT NULL,
	`status` text NOT NULL DEFAULT 'active',
	`figma_url` text,
	`canvas_state` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_feature_product_id` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `feature_product_idx` ON `feature` (`product_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `annotation` (
	`id` text PRIMARY KEY,
	`feature_id` text NOT NULL,
	`component_node_id` text,
	`component_name` text,
	`prompt` text NOT NULL,
	`ds_slider` real NOT NULL DEFAULT 0.5,
	`variation_count` integer NOT NULL DEFAULT 4,
	`enrichments` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_annotation_feature_id` FOREIGN KEY (`feature_id`) REFERENCES `feature`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `annotation_feature_idx` ON `annotation` (`feature_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `agent` (
	`id` text PRIMARY KEY,
	`feature_id` text NOT NULL,
	`annotation_id` text,
	`branch` text,
	`status` text NOT NULL DEFAULT 'working',
	`color` text,
	`title` text NOT NULL,
	`directory` text NOT NULL,
	`version` text NOT NULL,
	`permission` text,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_agent_feature_id` FOREIGN KEY (`feature_id`) REFERENCES `feature`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `agent_feature_idx` ON `agent` (`feature_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `agent_annotation_idx` ON `agent` (`annotation_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `message` (
	`id` text PRIMARY KEY,
	`agent_id` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_message_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `message_agent_idx` ON `message` (`agent_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `part` (
	`id` text PRIMARY KEY,
	`message_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_part_message_id` FOREIGN KEY (`message_id`) REFERENCES `message`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `part_message_idx` ON `part` (`message_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `part_agent_idx` ON `part` (`agent_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `variation` (
	`id` text PRIMARY KEY,
	`agent_id` text NOT NULL,
	`annotation_id` text NOT NULL,
	`label` text,
	`rationale` text,
	`branch_path` text,
	`status` text NOT NULL DEFAULT 'pending',
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	CONSTRAINT `fk_variation_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_variation_annotation_id` FOREIGN KEY (`annotation_id`) REFERENCES `annotation`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `variation_agent_idx` ON `variation` (`agent_id`);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `variation_annotation_idx` ON `variation` (`annotation_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `checkpoint` (
	`id` text PRIMARY KEY,
	`feature_id` text NOT NULL,
	`parent_id` text,
	`variation_id` text,
	`label` text NOT NULL,
	`git_ref` text NOT NULL,
	`time_created` integer NOT NULL,
	CONSTRAINT `fk_checkpoint_feature_id` FOREIGN KEY (`feature_id`) REFERENCES `feature`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_checkpoint_variation_id` FOREIGN KEY (`variation_id`) REFERENCES `variation`(`id`) ON DELETE SET NULL
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `checkpoint_feature_idx` ON `checkpoint` (`feature_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `todo` (
	`agent_id` text NOT NULL,
	`content` text NOT NULL,
	`status` text NOT NULL,
	`priority` text NOT NULL,
	`position` integer NOT NULL,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	PRIMARY KEY(`agent_id`, `position`),
	CONSTRAINT `fk_todo_agent_id` FOREIGN KEY (`agent_id`) REFERENCES `agent`(`id`) ON DELETE CASCADE
);--> statement-breakpoint

CREATE INDEX IF NOT EXISTS `todo_agent_idx` ON `todo` (`agent_id`);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `permission` (
	`product_id` text PRIMARY KEY,
	`time_created` integer NOT NULL,
	`time_updated` integer NOT NULL,
	`data` text NOT NULL,
	CONSTRAINT `fk_permission_product_id` FOREIGN KEY (`product_id`) REFERENCES `product`(`id`) ON DELETE CASCADE
);
