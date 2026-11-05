CREATE TYPE "public"."gift_address" AS ENUM('her', 'him');--> statement-breakpoint
CREATE TYPE "public"."gift_occasion" AS ENUM('birthday', 'wedding', 'eid', 'diwali', 'anniversary', 'rakhi', 'just_because');--> statement-breakpoint
CREATE TYPE "public"."gift_report_reason" AS ENUM('voice_or_likeness', 'copyright', 'hateful', 'minor_sexual', 'other');--> statement-breakpoint
CREATE TABLE "gift" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"song_id" uuid NOT NULL,
	"sender_id" text NOT NULL,
	"to_name" text NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"occasion" "gift_occasion" NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"cover_path" text,
	"address" "gift_address",
	"reply_to_gift_id" uuid,
	"free_reply" boolean DEFAULT false NOT NULL,
	"opened_at" timestamp,
	"play_count" integer DEFAULT 0 NOT NULL,
	"last_played_at" timestamp,
	"revoked_at" timestamp,
	"taken_down_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gift_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "gift_play" (
	"gift_id" uuid NOT NULL,
	"visitor" text NOT NULL,
	"day" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gift_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"gift_id" uuid NOT NULL,
	"reason" "gift_report_reason" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"email" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_sender_id_user_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift" ADD CONSTRAINT "gift_reply_to_gift_id_gift_id_fk" FOREIGN KEY ("reply_to_gift_id") REFERENCES "public"."gift"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_play" ADD CONSTRAINT "gift_play_gift_id_gift_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_report" ADD CONSTRAINT "gift_report_gift_id_gift_id_fk" FOREIGN KEY ("gift_id") REFERENCES "public"."gift"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gift_sender_created_idx" ON "gift" USING btree ("sender_id","created_at");--> statement-breakpoint
CREATE INDEX "gift_reply_to_idx" ON "gift" USING btree ("reply_to_gift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "gift_play_once_idx" ON "gift_play" USING btree ("gift_id","visitor","day");--> statement-breakpoint
CREATE INDEX "gift_report_gift_idx" ON "gift_report" USING btree ("gift_id");