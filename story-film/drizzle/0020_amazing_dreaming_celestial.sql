ALTER TABLE "agent_settings" ADD COLUMN "ai_provider" text DEFAULT 'reelkar' NOT NULL;--> statement-breakpoint
ALTER TABLE "agent_settings" ADD COLUMN "ai_model" text;--> statement-breakpoint
ALTER TABLE "agent_settings" ADD COLUMN "ai_key" text;--> statement-breakpoint
ALTER TABLE "agent_settings" ADD COLUMN "ai_key_hint" text;