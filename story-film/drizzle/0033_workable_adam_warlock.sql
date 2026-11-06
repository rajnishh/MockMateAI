ALTER TYPE "public"."ledger_reason" ADD VALUE 'iap';--> statement-breakpoint
CREATE TABLE "app_store_account" (
	"user_id" text PRIMARY KEY NOT NULL,
	"app_account_token" uuid DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "app_store_account_app_account_token_unique" UNIQUE("app_account_token")
);
--> statement-breakpoint
ALTER TABLE "app_store_account" ADD CONSTRAINT "app_store_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;