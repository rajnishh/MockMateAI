CREATE TYPE "public"."currency" AS ENUM('INR', 'USD');--> statement-breakpoint
CREATE TYPE "public"."film_quality" AS ENUM('standard', 'premium');--> statement-breakpoint
CREATE TYPE "public"."ledger_reason" AS ENUM('purchase', 'subscription', 'video', 'refund', 'grant');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('created', 'paid', 'failed');--> statement-breakpoint
CREATE TABLE "credit_balance" (
	"user_id" text PRIMARY KEY NOT NULL,
	"balance" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" "ledger_reason" NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"pack" text NOT NULL,
	"currency" "currency" NOT NULL,
	"amount" integer NOT NULL,
	"credits" integer NOT NULL,
	"razorpay_order_id" text NOT NULL,
	"razorpay_payment_id" text,
	"status" "purchase_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"paid_at" timestamp,
	CONSTRAINT "purchase_razorpay_order_id_unique" UNIQUE("razorpay_order_id")
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"plan" text NOT NULL,
	"currency" "currency" NOT NULL,
	"razorpay_subscription_id" text NOT NULL,
	"status" text DEFAULT 'created' NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"current_end" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_razorpay_subscription_id_unique" UNIQUE("razorpay_subscription_id")
);
--> statement-breakpoint
CREATE TABLE "webhook_event" (
	"id" text PRIMARY KEY NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "film" ADD COLUMN "quality" "film_quality" DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "film" ADD COLUMN "credits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_balance" ADD CONSTRAINT "credit_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_ledger_reason_ref_idx" ON "credit_ledger" USING btree ("reason","ref");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_user_idx" ON "purchase" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_user_idx" ON "subscription" USING btree ("user_id");