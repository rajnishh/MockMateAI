ALTER TYPE "public"."social_platform" ADD VALUE 'instagram';--> statement-breakpoint
ALTER TABLE "social_account" ALTER COLUMN "refresh_token" DROP NOT NULL;