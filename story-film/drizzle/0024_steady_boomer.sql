CREATE TYPE "public"."duet_part_kind" AS ENUM('hum', 'sing');--> statement-breakpoint
CREATE TYPE "public"."duet_status" AS ENUM('waiting', 'joining', 'ready', 'declined', 'cancelled', 'solo');--> statement-breakpoint
CREATE TABLE "duet" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"starter_id" text NOT NULL,
	"partner_id" text,
	"starter_name" text NOT NULL,
	"partner_name" text DEFAULT '' NOT NULL,
	"starter_ig" text DEFAULT '' NOT NULL,
	"partner_ig" text DEFAULT '' NOT NULL,
	"topic" text NOT NULL,
	"genre" text NOT NULL,
	"language" text NOT NULL,
	"status" "duet_status" DEFAULT 'waiting' NOT NULL,
	"part_a_path" text,
	"part_a_kind" "duet_part_kind",
	"part_a_text" text DEFAULT '' NOT NULL,
	"part_a_sec" integer,
	"part_b_path" text,
	"part_b_kind" "duet_part_kind",
	"part_b_text" text DEFAULT '' NOT NULL,
	"part_b_sec" integer,
	"song_id" uuid,
	"paid_a" integer DEFAULT 0 NOT NULL,
	"paid_b" integer DEFAULT 0 NOT NULL,
	"retakes_a" integer DEFAULT 0 NOT NULL,
	"retakes_b" integer DEFAULT 0 NOT NULL,
	"approved_a" timestamp,
	"approved_b" timestamp,
	"retake_asked_of" text,
	"decline_note" text DEFAULT '' NOT NULL,
	"expires_at" timestamp,
	"extended" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "duet_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "duet_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"duet_id" uuid NOT NULL,
	"reason" "gift_report_reason" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_post" ADD COLUMN "collaborators" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "duet" ADD CONSTRAINT "duet_starter_id_user_id_fk" FOREIGN KEY ("starter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duet" ADD CONSTRAINT "duet_partner_id_user_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duet" ADD CONSTRAINT "duet_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duet_report" ADD CONSTRAINT "duet_report_duet_id_duet_id_fk" FOREIGN KEY ("duet_id") REFERENCES "public"."duet"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "duet_starter_idx" ON "duet" USING btree ("starter_id","created_at");--> statement-breakpoint
CREATE INDEX "duet_partner_idx" ON "duet" USING btree ("partner_id","created_at");--> statement-breakpoint
CREATE INDEX "duet_report_duet_idx" ON "duet_report" USING btree ("duet_id");