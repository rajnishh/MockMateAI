CREATE TABLE "song" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"genre" text NOT NULL,
	"mood" text DEFAULT '' NOT NULL,
	"language" text NOT NULL,
	"lyrics" text NOT NULL,
	"duration_sec" integer NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"status" "film_status" DEFAULT 'queued' NOT NULL,
	"output_path" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "song" ADD CONSTRAINT "song_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "song_user_created_idx" ON "song" USING btree ("user_id","created_at");