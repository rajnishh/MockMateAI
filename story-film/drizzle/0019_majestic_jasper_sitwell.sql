ALTER TYPE "public"."film_quality" ADD VALUE 'cinematic';--> statement-breakpoint
ALTER TABLE "film" ADD COLUMN "photo_consent_at" timestamp;