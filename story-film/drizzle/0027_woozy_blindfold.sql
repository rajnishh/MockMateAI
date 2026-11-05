CREATE TYPE "public"."push_lang" AS ENUM('en', 'hi', 'ar');--> statement-breakpoint
CREATE TYPE "public"."push_platform" AS ENUM('ios', 'android');--> statement-breakpoint
CREATE TABLE "push_prefs" (
	"user_id" text PRIMARY KEY NOT NULL,
	"songs" boolean DEFAULT true NOT NULL,
	"reels" boolean DEFAULT true NOT NULL,
	"gifts" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_token" ADD COLUMN "platform" "push_platform";--> statement-breakpoint
ALTER TABLE "push_token" ADD COLUMN "lang" "push_lang" DEFAULT 'en' NOT NULL;--> statement-breakpoint
ALTER TABLE "push_token" ADD COLUMN "created_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "push_prefs" ADD CONSTRAINT "push_prefs_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;