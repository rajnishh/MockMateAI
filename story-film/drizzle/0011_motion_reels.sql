CREATE TYPE "public"."film_format" AS ENUM('story', 'motion');--> statement-breakpoint
ALTER TABLE "film" ADD COLUMN "format" "film_format" DEFAULT 'story' NOT NULL;