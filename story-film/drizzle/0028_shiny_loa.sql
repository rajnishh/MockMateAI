CREATE TYPE "public"."earning_source" AS ENUM('remix', 'recipe');--> statement-breakpoint
CREATE TYPE "public"."earning_status" AS ENUM('pending', 'earned', 'dropped');--> statement-breakpoint
CREATE TYPE "public"."remix_kind" AS ENUM('cover', 'extend', 'replace', 'rap', 'add-vocals', 'add-instrumental');--> statement-breakpoint
ALTER TYPE "public"."ledger_reason" ADD VALUE 'earning';--> statement-breakpoint
CREATE TABLE "creator_earning" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"source" "earning_source" NOT NULL,
	"source_ref" text NOT NULL,
	"subject_ref" text NOT NULL,
	"payer_user_id" text,
	"charged" integer NOT NULL,
	"paid_ratio_bp" integer NOT NULL,
	"rate_bp" integer NOT NULL,
	"hundredths" integer NOT NULL,
	"status" "earning_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "remix_link" (
	"child_song_id" uuid PRIMARY KEY NOT NULL,
	"parent_song_id" uuid NOT NULL,
	"parent_user_id" text,
	"root_song_id" uuid NOT NULL,
	"depth" integer NOT NULL,
	"kind" "remix_kind" NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_balance" ADD COLUMN "earned_hundredths" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "credit_balance" ADD COLUMN "earned_credited" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_prefs" ADD COLUMN "remixes" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "creator_earning" ADD CONSTRAINT "creator_earning_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "creator_earning" ADD CONSTRAINT "creator_earning_payer_user_id_user_id_fk" FOREIGN KEY ("payer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "remix_link" ADD CONSTRAINT "remix_link_child_song_id_song_id_fk" FOREIGN KEY ("child_song_id") REFERENCES "public"."song"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "creator_earning_source_idx" ON "creator_earning" USING btree ("source","source_ref");--> statement-breakpoint
CREATE INDEX "creator_earning_user_idx" ON "creator_earning" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "creator_earning_subject_idx" ON "creator_earning" USING btree ("user_id","subject_ref");--> statement-breakpoint
CREATE INDEX "remix_link_parent_idx" ON "remix_link" USING btree ("parent_song_id");--> statement-breakpoint
CREATE INDEX "remix_link_root_idx" ON "remix_link" USING btree ("root_song_id");--> statement-breakpoint
-- Backfill (hand-written): remixes made before remix_link. A remix is a song with a parent that isn't
-- a "my voice" version, and either remixes someone else's song or has a remix title suffix (edits and
-- mixes of your own songs also have a parent, but other suffixes). The kind comes from the suffix,
-- else cover. Chains get their root and depth by walking up.
WITH RECURSIVE remix AS (
	SELECT c.id, c.parent_song_id, p.user_id AS parent_user_id, c.created_at,
		CASE
			WHEN c.title LIKE '% (extended)' THEN 'extend'
			WHEN c.title LIKE '% (new part)' THEN 'replace'
			WHEN c.title LIKE '% (rap)' THEN 'rap'
			WHEN c.title LIKE '% (with vocals)' THEN 'add-vocals'
			WHEN c.title LIKE '% (new music)' THEN 'add-instrumental'
			ELSE 'cover'
		END AS kind
	FROM "song" c JOIN "song" p ON p.id = c.parent_song_id
	WHERE c.voice_profile_id IS NULL
		AND (c.user_id <> p.user_id OR c.title ~ ' \((cover|extended|new part|rap|with vocals|new music)\)$')
),
chain AS (
	SELECT id, parent_song_id AS root, 1 AS depth FROM remix
	UNION ALL
	SELECT chain.id, r.parent_song_id, chain.depth + 1 FROM chain JOIN remix r ON r.id = chain.root WHERE chain.depth < 100
)
INSERT INTO "remix_link" ("child_song_id", "parent_song_id", "parent_user_id", "root_song_id", "depth", "kind", "created_at")
SELECT r.id, r.parent_song_id, r.parent_user_id, c.root, c.depth, r.kind::"remix_kind", r.created_at
FROM remix r JOIN (SELECT DISTINCT ON (id) id, root, depth FROM chain ORDER BY id, depth DESC) c ON c.id = r.id
ON CONFLICT DO NOTHING;
