CREATE TYPE "public"."oauth_token_kind" AS ENUM('code', 'access', 'refresh');--> statement-breakpoint
CREATE TABLE "oauth_client" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" jsonb NOT NULL,
	"secret_hash" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_grant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"client_id" text NOT NULL,
	"client_name" text NOT NULL,
	"redirect_host" text NOT NULL,
	"scope" text NOT NULL,
	"resource" text NOT NULL,
	"time_zone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_token" (
	"hash" text PRIMARY KEY NOT NULL,
	"grant_id" uuid NOT NULL,
	"kind" "oauth_token_kind" NOT NULL,
	"redirect_uri" text,
	"code_challenge" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "oauth_grant" ADD CONSTRAINT "oauth_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_token" ADD CONSTRAINT "oauth_token_grant_id_oauth_grant_id_fk" FOREIGN KEY ("grant_id") REFERENCES "public"."oauth_grant"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "oauth_grant_user_idx" ON "oauth_grant" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "oauth_token_grant_idx" ON "oauth_token" USING btree ("grant_id");