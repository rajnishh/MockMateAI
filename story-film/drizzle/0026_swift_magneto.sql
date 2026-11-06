CREATE TYPE "public"."song_reaction_kind" AS ENUM('fire', 'dance', 'touched', 'haha', 'respect', 'celebrate');--> statement-breakpoint
CREATE TABLE "creator_profile" (
	"user_id" text PRIMARY KEY NOT NULL,
	"handle" text NOT NULL,
	"handle_changed_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "creator_profile_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "song_play" (
	"song_id" uuid NOT NULL,
	"listener" text NOT NULL,
	"day" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_reaction" (
	"song_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" "song_reaction_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"song_id" uuid NOT NULL,
	"reason" "gift_report_reason" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"email" text,
	"reporter_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "song_vote" (
	"song_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"value" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "public_id" text;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "published_at" timestamp;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "show_lyrics" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "allow_remix" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "taken_down_at" timestamp;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "play_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "like_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "dislike_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_profile" ADD CONSTRAINT "creator_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_play" ADD CONSTRAINT "song_play_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_reaction" ADD CONSTRAINT "song_reaction_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_reaction" ADD CONSTRAINT "song_reaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_report" ADD CONSTRAINT "song_report_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_report" ADD CONSTRAINT "song_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_vote" ADD CONSTRAINT "song_vote_song_id_song_id_fk" FOREIGN KEY ("song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song_vote" ADD CONSTRAINT "song_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "song_play_once_idx" ON "song_play" USING btree ("song_id","listener","day");--> statement-breakpoint
CREATE INDEX "song_play_day_idx" ON "song_play" USING btree ("day");--> statement-breakpoint
CREATE UNIQUE INDEX "song_reaction_once_idx" ON "song_reaction" USING btree ("song_id","user_id");--> statement-breakpoint
CREATE INDEX "song_report_song_idx" ON "song_report" USING btree ("song_id");--> statement-breakpoint
CREATE UNIQUE INDEX "song_vote_once_idx" ON "song_vote" USING btree ("song_id","user_id");--> statement-breakpoint
CREATE INDEX "song_vote_user_idx" ON "song_vote" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "song_published_idx" ON "song" USING btree ("published_at");--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_public_id_unique" UNIQUE("public_id");