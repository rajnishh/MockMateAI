CREATE TYPE "public"."agent_action_status" AS ENUM('proposed', 'waiting', 'done', 'cancelled', 'failed');--> statement-breakpoint
CREATE TYPE "public"."agent_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."posting_mode" AS ENUM('ask', 'auto_schedule', 'auto_now');--> statement-breakpoint
CREATE TABLE "agent_action" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"input" jsonb NOT NULL,
	"status" "agent_action_status" NOT NULL,
	"film_id" uuid,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_message" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"role" "agent_role" NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"cards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"posting_mode" "posting_mode" DEFAULT 'ask' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_action" ADD CONSTRAINT "agent_action_film_id_film_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."film"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_message" ADD CONSTRAINT "agent_message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_settings" ADD CONSTRAINT "agent_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_action_user_idx" ON "agent_action" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "agent_action_film_idx" ON "agent_action" USING btree ("film_id","status");--> statement-breakpoint
CREATE INDEX "agent_message_user_created_idx" ON "agent_message" USING btree ("user_id","created_at");