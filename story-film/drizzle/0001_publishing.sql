CREATE TYPE "public"."post_privacy" AS ENUM('public', 'unlisted', 'private');--> statement-breakpoint
CREATE TYPE "public"."post_status" AS ENUM('scheduled', 'publishing', 'published', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."social_platform" AS ENUM('youtube');--> statement-breakpoint
CREATE TABLE "scheduled_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"film_id" uuid NOT NULL,
	"social_account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"privacy" "post_privacy" DEFAULT 'public' NOT NULL,
	"made_for_kids" boolean DEFAULT false NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" "post_status" DEFAULT 'scheduled' NOT NULL,
	"external_id" text,
	"external_url" text,
	"error" text,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "social_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"platform" "social_platform" NOT NULL,
	"external_id" text NOT NULL,
	"name" text NOT NULL,
	"image_url" text,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "film" ADD COLUMN "kid_safe" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_post" ADD CONSTRAINT "scheduled_post_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_post" ADD CONSTRAINT "scheduled_post_film_id_film_id_fk" FOREIGN KEY ("film_id") REFERENCES "public"."film"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_post" ADD CONSTRAINT "scheduled_post_social_account_id_social_account_id_fk" FOREIGN KEY ("social_account_id") REFERENCES "public"."social_account"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "social_account" ADD CONSTRAINT "social_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_post_user_time_idx" ON "scheduled_post" USING btree ("user_id","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "social_account_user_platform_external_idx" ON "social_account" USING btree ("user_id","platform","external_id");