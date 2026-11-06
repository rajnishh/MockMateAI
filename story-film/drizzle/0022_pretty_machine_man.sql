CREATE TABLE "ai_engine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"key" text,
	"key_hint" text,
	"extra" text,
	"position" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_engine" ADD CONSTRAINT "ai_engine_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_engine_user_idx" ON "ai_engine" USING btree ("user_id","position");--> statement-breakpoint
-- Ask Reelkar's single AI choice becomes the creator's first engine.
INSERT INTO "ai_engine" ("user_id", "provider", "model", "key", "key_hint", "position") SELECT "user_id", "ai_provider", "ai_model", "ai_key", "ai_key_hint", 0 FROM "agent_settings" WHERE "ai_provider" <> 'reelkar' AND "ai_model" IS NOT NULL;
