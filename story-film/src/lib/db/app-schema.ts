import { STYLE_IDS } from "@/lib/styles";
import { relations } from "drizzle-orm";
import { type AnyPgColumn, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const filmStyle = pgEnum("film_style", STYLE_IDS);
// "story": AI pictures and motion; "motion": animated text and graphics (no image or video models);
// "edit": the creator's own uploaded video with captions, zooms and cards.
export const filmFormat = pgEnum("film_format", ["story", "motion", "edit"]);
export const filmQuality = pgEnum("film_quality", ["standard", "premium"]);
// "review": an edit is planned and waits for the creator to check its effects before rendering.
export const filmStatus = pgEnum("film_status", ["queued", "running", "review", "completed", "failed"]);

export const character = pgTable(
  "character",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description").notNull(),
    style: filmStyle("style").notNull(),
    referenceImageUrl: text("reference_image_url").notNull(),
    seed: integer("seed").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("character_user_idx").on(t.userId)],
);

// One row per video request; the id doubles as the BullMQ job id.
export const film = pgTable(
  "film",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    characterId: uuid("character_id").references(() => character.id, { onDelete: "set null" }),
    // Set for music videos: the song this video was made for.
    songId: uuid("song_id").references((): AnyPgColumn => song.id, { onDelete: "set null" }),
    story: text("story").notNull(),
    style: filmStyle("style").notNull(),
    format: filmFormat("format").notNull().default("story"),
    durationSec: integer("duration_sec").notNull(),
    kidSafe: boolean("kid_safe").notNull().default(false),
    quality: filmQuality("quality").notNull().default("standard"),
    // Credits charged for this film; refunded if it fails.
    credits: integer("credits").notNull().default(0),
    status: filmStatus("status").default("queued").notNull(),
    stage: text("stage"),
    title: text("title"),
    outputPath: text("output_path"),
    // True when C2PA Content Credentials were embedded in the output.
    contentCredentials: boolean("content_credentials").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("film_user_created_idx").on(t.userId, t.createdAt)],
);

export const socialPlatform = pgEnum("social_platform", ["youtube", "instagram"]);
export const postStatus = pgEnum("post_status", ["scheduled", "publishing", "published", "failed", "cancelled"]);
export const postPrivacy = pgEnum("post_privacy", ["public", "unlisted", "private"]);

// A channel/profile the user connected for publishing. Separate from sign-in,
// so a phone-login user can still publish to any Google account's channel.
export const socialAccount = pgTable(
  "social_account",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: socialPlatform("platform").notNull(),
    externalId: text("external_id").notNull(),
    name: text("name").notNull(),
    imageUrl: text("image_url"),
    // Encrypted with TOKEN_ENCRYPTION_KEY.
    accessToken: text("access_token").notNull(),
    // YouTube only; Instagram refreshes the long-lived access token itself.
    refreshToken: text("refresh_token"),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("social_account_user_platform_external_idx").on(t.userId, t.platform, t.externalId)],
);

export const scheduledPost = pgTable(
  "scheduled_post",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    filmId: uuid("film_id")
      .notNull()
      .references(() => film.id, { onDelete: "cascade" }),
    socialAccountId: uuid("social_account_id")
      .notNull()
      .references(() => socialAccount.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    tags: text("tags").array().notNull().default([]),
    privacy: postPrivacy("privacy").notNull().default("public"),
    madeForKids: boolean("made_for_kids").notNull().default(false),
    scheduledAt: timestamp("scheduled_at").notNull(),
    status: postStatus("status").notNull().default("scheduled"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    error: text("error"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("scheduled_post_user_time_idx").on(t.userId, t.scheduledAt)],
);

export const ledgerReason = pgEnum("ledger_reason", ["purchase", "subscription", "video", "refund", "grant", "song"]);
export const purchaseStatus = pgEnum("purchase_status", ["created", "paid", "failed"]);
export const currency = pgEnum("currency", ["INR", "USD", "AED"]);

export const creditBalance = pgTable("credit_balance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Append-only history. (reason, ref) is unique so a payment or film can never
// be credited or charged twice, even if a webhook is delivered again.
export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: ledgerReason("reason").notNull(),
    ref: text("ref").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("credit_ledger_reason_ref_idx").on(t.reason, t.ref), index("credit_ledger_user_idx").on(t.userId, t.createdAt)],
);

export const purchase = pgTable(
  "purchase",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    pack: text("pack").notNull(),
    currency: currency("currency").notNull(),
    // Smallest unit: paise or cents.
    amount: integer("amount").notNull(),
    credits: integer("credits").notNull(),
    razorpayOrderId: text("razorpay_order_id").notNull().unique(),
    razorpayPaymentId: text("razorpay_payment_id"),
    status: purchaseStatus("status").notNull().default("created"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    paidAt: timestamp("paid_at"),
  },
  (t) => [index("purchase_user_idx").on(t.userId)],
);

export const subscription = pgTable(
  "subscription",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    plan: text("plan").notNull(),
    currency: currency("currency").notNull(),
    razorpaySubscriptionId: text("razorpay_subscription_id").notNull().unique(),
    // Mirrors Razorpay: created, authenticated, active, pending, halted, cancelled, completed.
    status: text("status").notNull().default("created"),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    currentEnd: timestamp("current_end"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("subscription_user_idx").on(t.userId)],
);

// Razorpay event ids already handled (webhooks can be delivered more than once).
export const webhookEvent = pgTable("webhook_event", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at").defaultNow().notNull(),
});

// A user's own voice, kept only with recorded, verified consent.
export const voiceProfile = pgTable(
  "voice_profile",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    samplePath: text("sample_path").notNull(),
    durationSec: integer("duration_sec").notNull(),
    // Consent evidence: the statement shown, the code the user had to say, what
    // the recording was transcribed as, and when/where they agreed.
    consentText: text("consent_text").notNull(),
    consentCode: text("consent_code").notNull(),
    transcript: text("transcript").notNull(),
    consentIp: text("consent_ip"),
    consentUserAgent: text("consent_user_agent"),
    consentedAt: timestamp("consented_at").defaultNow().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("voice_profile_user_idx").on(t.userId)],
);

export const song = pgTable(
  "song",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    genre: text("genre").notNull(),
    mood: text("mood").notNull().default(""),
    language: text("language").notNull(),
    lyrics: text("lyrics").notNull(),
    durationSec: integer("duration_sec").notNull(),
    // Set for "my voice" versions: the original song and the voice used.
    parentSongId: uuid("parent_song_id").references((): AnyPgColumn => song.id, { onDelete: "set null" }),
    voiceProfileId: uuid("voice_profile_id").references(() => voiceProfile.id, { onDelete: "set null" }),
    credits: integer("credits").notNull().default(0),
    status: filmStatus("status").default("queued").notNull(),
    outputPath: text("output_path"),
    contentCredentials: boolean("content_credentials").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("song_user_created_idx").on(t.userId, t.createdAt)],
);

// "Ask Reelkar", the built-in agent. How it may post: always ask first, schedule on its own, or post at once.
export const postingMode = pgEnum("posting_mode", ["ask", "auto_schedule", "auto_now"]);
export const agentRole = pgEnum("agent_role", ["user", "assistant"]);
// proposed: waits for the creator's approval; waiting: approved, waits for its reel to finish.
export const agentActionStatus = pgEnum("agent_action_status", ["proposed", "waiting", "done", "cancelled", "failed"]);

export const agentSettings = pgTable("agent_settings", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  postingMode: postingMode("posting_mode").notNull().default("ask"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const agentMessage = pgTable(
  "agent_message",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: agentRole("role").notNull(),
    text: text("text").notNull().default(""),
    // What the agent did, shown as cards (reels, posts, approvals...).
    cards: jsonb("cards").notNull().default([]),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("agent_message_user_created_idx").on(t.userId, t.createdAt)],
);

export const agentAction = pgTable(
  "agent_action",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    // Fully resolved input (film, accounts, time), so approving later does exactly what was shown.
    input: jsonb("input").notNull(),
    status: agentActionStatus("status").notNull(),
    filmId: uuid("film_id").references(() => film.id, { onDelete: "cascade" }),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("agent_action_user_idx").on(t.userId, t.createdAt), index("agent_action_film_idx").on(t.filmId, t.status)],
);

// Personal access keys that let an AI assistant (Claude, Cursor...) use Reelkar for a creator
// through the connector at /api/mcp. Only a SHA-256 hash of the key is stored.
export const apiToken = pgTable(
  "api_token",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    // The last four characters, so creators can tell keys apart.
    hint: text("hint").notNull(),
    // The creator's time zone when the key was made: "tomorrow evening" from an assistant means theirs.
    timeZone: text("time_zone").notNull().default("Asia/Kolkata"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("api_token_hash_idx").on(t.tokenHash), index("api_token_user_idx").on(t.userId)],
);

export const characterRelations = relations(character, ({ one, many }) => ({
  user: one(user, { fields: [character.userId], references: [user.id] }),
  films: many(film),
}));

export const filmRelations = relations(film, ({ one }) => ({
  user: one(user, { fields: [film.userId], references: [user.id] }),
  character: one(character, { fields: [film.characterId], references: [character.id] }),
}));

export const scheduledPostRelations = relations(scheduledPost, ({ one }) => ({
  film: one(film, { fields: [scheduledPost.filmId], references: [film.id] }),
  socialAccount: one(socialAccount, { fields: [scheduledPost.socialAccountId], references: [socialAccount.id] }),
}));
