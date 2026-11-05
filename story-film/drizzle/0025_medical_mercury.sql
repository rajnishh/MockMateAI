CREATE TABLE "push_token" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "invited_user_id" text;--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "invited_ig" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "voice_a" uuid;--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "voice_b" uuid;--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "paid_voice_a" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "paid_voice_b" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "reminded_at" timestamp;--> statement-breakpoint
ALTER TABLE "push_token" ADD CONSTRAINT "push_token_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_token_user_idx" ON "push_token" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "duet" ADD CONSTRAINT "duet_invited_user_id_user_id_fk" FOREIGN KEY ("invited_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duet" ADD CONSTRAINT "duet_voice_a_voice_profile_id_fk" FOREIGN KEY ("voice_a") REFERENCES "public"."voice_profile"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "duet" ADD CONSTRAINT "duet_voice_b_voice_profile_id_fk" FOREIGN KEY ("voice_b") REFERENCES "public"."voice_profile"("id") ON DELETE set null ON UPDATE no action;