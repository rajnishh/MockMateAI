CREATE TABLE "user_block" (
	"blocker_id" text NOT NULL,
	"blocked_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "duet" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "duet_report" ADD COLUMN "reporter_id" text;--> statement-breakpoint
ALTER TABLE "duet_report" ADD COLUMN "reporter_key" text;--> statement-breakpoint
ALTER TABLE "gift" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "gift_report" ADD COLUMN "reporter_id" text;--> statement-breakpoint
ALTER TABLE "gift_report" ADD COLUMN "reporter_key" text;--> statement-breakpoint
ALTER TABLE "recipe" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "recipe_report" ADD COLUMN "reporter_key" text;--> statement-breakpoint
ALTER TABLE "song" ADD COLUMN "hidden_at" timestamp;--> statement-breakpoint
ALTER TABLE "song_report" ADD COLUMN "reporter_key" text;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocker_id_user_id_fk" FOREIGN KEY ("blocker_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_block" ADD CONSTRAINT "user_block_blocked_id_user_id_fk" FOREIGN KEY ("blocked_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "user_block_pair_idx" ON "user_block" USING btree ("blocker_id","blocked_id");--> statement-breakpoint
CREATE INDEX "user_block_blocked_idx" ON "user_block" USING btree ("blocked_id");--> statement-breakpoint
ALTER TABLE "duet_report" ADD CONSTRAINT "duet_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gift_report" ADD CONSTRAINT "gift_report_reporter_id_user_id_fk" FOREIGN KEY ("reporter_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "song_report_reporter_idx" ON "song_report" USING btree ("reporter_id");