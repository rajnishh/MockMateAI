CREATE TYPE "public"."recipe_preview" AS ENUM('reel', 'look');--> statement-breakpoint
CREATE TYPE "public"."recipe_use_status" AS ENUM('started', 'completed', 'failed');--> statement-breakpoint
CREATE TABLE "recipe" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"public_id" text NOT NULL,
	"maker_id" text NOT NULL,
	"source_film_id" uuid,
	"format" "film_format" NOT NULL,
	"name" text NOT NULL,
	"occasions" text[] DEFAULT '{}'::text[] NOT NULL,
	"spec" jsonb NOT NULL,
	"topic_hint" text DEFAULT '' NOT NULL,
	"language_hint" text,
	"quality" "film_quality" DEFAULT 'standard' NOT NULL,
	"duration_sec" integer NOT NULL,
	"kid_safe" boolean DEFAULT false NOT NULL,
	"preview_kind" "recipe_preview" DEFAULT 'look' NOT NULL,
	"preview_path" text,
	"poster_path" text,
	"music_path" text,
	"published_at" timestamp,
	"unpublished_at" timestamp,
	"taken_down_at" timestamp,
	"use_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"reason" "gift_report_reason" NOT NULL,
	"details" text DEFAULT '' NOT NULL,
	"email" text,
	"reporter_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_use" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"film_id" uuid NOT NULL,
	"credits" integer DEFAULT 0 NOT NULL,
	"own_use" boolean DEFAULT false NOT NULL,
	"earning_id" uuid,
	"status" "recipe_use_status" DEFAULT 'started' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	CONSTRAINT "recipe_use_film_id_unique" UNIQUE("film_id")
);
--> statement-breakpoint
ALTER TABLE "film" ADD COLUMN "recipe_id" uuid;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_maker_id_user_id_fk" FOREIGN KEY ("maker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe" ADD CONSTRAINT "recipe_source_film_id_film_id_fk" FOREIGN KEY ("source_film_id") REFERENCES "public"."film"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_report" ADD CONSTRAINT "recipe_report_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_report" ADD CONSTRAINT "recipe_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_use" ADD CONSTRAINT "recipe_use_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_use" ADD CONSTRAINT "recipe_use_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_use" ADD CONSTRAINT "recipe_use_film_id_film_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."film"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_use" ADD CONSTRAINT "recipe_use_earning_id_creator_earning_id_fk" FOREIGN KEY ("earning_id") REFERENCES "public"."creator_earning"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recipe_published_idx" ON "recipe" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "recipe_format_idx" ON "recipe" USING btree ("format");--> statement-breakpoint
CREATE INDEX "recipe_occasions_idx" ON "recipe" USING gin ("occasions");--> statement-breakpoint
CREATE INDEX "recipe_maker_idx" ON "recipe" USING btree ("maker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_source_film_idx" ON "recipe" USING btree ("source_film_id");--> statement-breakpoint
CREATE INDEX "recipe_report_recipe_idx" ON "recipe_report" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_report_reporter_idx" ON "recipe_report" USING btree ("reporter_id");--> statement-breakpoint
CREATE INDEX "recipe_use_recipe_idx" ON "recipe_use" USING btree ("recipe_id","completed_at");--> statement-breakpoint
ALTER TABLE "film" ADD CONSTRAINT "film_recipe_id_recipe_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipe"("id") ON DELETE set null ON UPDATE no action;