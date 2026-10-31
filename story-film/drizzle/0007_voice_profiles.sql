CREATE TABLE "voice_profile" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"sample_path" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"consent_text" text NOT NULL,
	"consent_code" text NOT NULL,
	"transcript" text NOT NULL,
	"consent_ip" text,
	"consent_user_agent" text,
	"consented_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "parent_song_id" uuid;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "voice_profile_id" uuid;--> statement-breakpoint
ALTER TABLE "voice_profile" ADD CONSTRAINT "voice_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_profile_user_idx" ON "voice_profile" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_parent_song_id_song_id_fk" FOREIGN KEY ("parent_song_id") REFERENCES "public"."song"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_voice_profile_id_voice_profile_id_fk" FOREIGN KEY ("voice_profile_id") REFERENCES "public"."voice_profile"("id") ON DELETE set null ON UPDATE no action;