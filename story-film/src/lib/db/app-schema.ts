import { STYLE_IDS } from "@/lib/styles";
import { relations } from "drizzle-orm";
import { type AnyPgColumn, boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const filmStyle = pgEnum("film_style", STYLE_IDS);
// "story": AI pictures and motion; "motion": animated text and graphics (no image or video models);
// "edit": the creator's own uploaded video with captions, zooms and cards;
// "dance": cartoon kids dancing to a dhol beat with a chant, all drawn by Reelkar.
export const filmFormat = pgEnum("film_format", ["story", "motion", "edit", "dance"]);
export const filmQuality = pgEnum("film_quality", ["standard", "premium", "cinematic"]);
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
    // When the creator confirmed the uploaded photo is of them, or of someone who agreed.
    photoConsentAt: timestamp("photo_consent_at"),
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
    // Instagram usernames shown as co-authors (a Jugalbandi's partner); only for an approved duet.
    collaborators: text("collaborators").array().notNull().default([]),
    status: postStatus("status").notNull().default("scheduled"),
    externalId: text("external_id"),
    externalUrl: text("external_url"),
    error: text("error"),
    publishedAt: timestamp("published_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("scheduled_post_user_time_idx").on(t.userId, t.scheduledAt)],
);

// "earning": whole credits a creator earned from remixes of their songs or uses of their recipes
// (src/lib/billing/earnings.ts). Earned credits count as free, like "grant".
export const ledgerReason = pgEnum("ledger_reason", ["purchase", "subscription", "video", "refund", "grant", "song", "earning"]);
export const purchaseStatus = pgEnum("purchase_status", ["created", "paid", "failed"]);
export const currency = pgEnum("currency", ["INR", "USD", "AED"]);

export const creditBalance = pgTable("credit_balance", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  balance: integer("balance").notNull().default(0),
  // Earnings, in hundredths of a credit: everything earned so far, and how many whole credits of
  // it are already in the balance. The rest is "on the way".
  earnedHundredths: integer("earned_hundredths").notNull().default(0),
  earnedCredited: integer("earned_credited").notNull().default(0),
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
    // AI cover art, a square JPEG made after the song; null until then, or if the picture failed.
    coverPath: text("cover_path"),
    contentCredentials: boolean("content_credentials").notNull().default(false),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    // Listen (docs/PLAN.md item 44): a song is private until its maker publishes it. The public
    // link is /s/{publicId}, made at first publish and kept, so an old link works again after a re-publish.
    publicId: text("public_id").unique(),
    publishedAt: timestamp("published_at"),
    showLyrics: boolean("show_lyrics").notNull().default(true),
    allowRemix: boolean("allow_remix").notNull().default(true),
    // Set by the owner after a report; a taken-down song can't be published again by its maker.
    takenDownAt: timestamp("taken_down_at"),
    // Counters for sorting; the rows behind them are in song_play and song_vote.
    playCount: integer("play_count").notNull().default(0),
    likeCount: integer("like_count").notNull().default(0),
    dislikeCount: integer("dislike_count").notNull().default(0),
  },
  (t) => [index("song_user_created_idx").on(t.userId, t.createdAt), index("song_published_idx").on(t.publishedAt)],
);

// A creator's public name on Listen. Handles are lowercase a-z, 0-9, dot and underscore.
export const creatorProfile = pgTable("creator_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  handle: text("handle").notNull().unique(),
  handleChangedAt: timestamp("handle_changed_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One row per listener per song per day; the listener is a user id, or "v:" plus a browser cookie id.
export const songPlay = pgTable(
  "song_play",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => song.id, { onDelete: "cascade" }),
    listener: text("listener").notNull(),
    day: text("day").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("song_play_once_idx").on(t.songId, t.listener, t.day), index("song_play_day_idx").on(t.day)],
);

// Like (+1) or "Not for me" (-1), one per person per song.
export const songVote = pgTable(
  "song_vote",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => song.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    value: integer("value").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("song_vote_once_idx").on(t.songId, t.userId), index("song_vote_user_idx").on(t.userId)],
);

export const songReactionKind = pgEnum("song_reaction_kind", ["fire", "dance", "touched", "haha", "respect", "celebrate"]);

// One reaction per person per song.
export const songReaction = pgTable(
  "song_reaction",
  {
    songId: uuid("song_id")
      .notNull()
      .references(() => song.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: songReactionKind("kind").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [uniqueIndex("song_reaction_once_idx").on(t.songId, t.userId)],
);

// Remix chains (design/community/remix-spec.md): one row per remix, own songs too. The parent and
// root have no foreign key, so a deleted song in the middle of a chain becomes a "No longer
// available" node and its remixes stay in the family. Same kinds as REMIX_KINDS in src/lib/songs/remix.ts.
export const remixKind = pgEnum("remix_kind", ["cover", "extend", "replace", "rap", "add-vocals", "add-instrumental"]);

export const remixLink = pgTable(
  "remix_link",
  {
    childSongId: uuid("child_song_id")
      .primaryKey()
      .references(() => song.id, { onDelete: "cascade" }),
    parentSongId: uuid("parent_song_id").notNull(),
    // Who made the parent when it was remixed: for earnings and the Inbox.
    parentUserId: text("parent_user_id"),
    // The top of the family: the parent's root, or the parent itself.
    rootSongId: uuid("root_song_id").notNull(),
    // 1 for a remix of an original, 2 for a remix of that, and so on.
    depth: integer("depth").notNull(),
    kind: remixKind("kind").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("remix_link_parent_idx").on(t.parentSongId), index("remix_link_root_idx").on(t.rootSongId)],
);

// Creator earnings, shared by remixes and reel recipes (src/lib/billing/earnings.ts). One row per
// thing that earned: a remix (source_ref = the remix song id, subject_ref = the parent song id) or a
// reel made with a recipe (the reel id and the recipe id). Amounts are hundredths of a credit.
export const earningSource = pgEnum("earning_source", ["remix", "recipe"]);
// pending: charged, waiting for the remix or reel to finish; earned: added to the earner's total;
// dropped: it failed (and was refunded) or its subject was taken down.
export const earningStatus = pgEnum("earning_status", ["pending", "earned", "dropped"]);

export const creatorEarning = pgTable(
  "creator_earning",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    source: earningSource("source").notNull(),
    sourceRef: text("source_ref").notNull(),
    subjectRef: text("subject_ref").notNull(),
    payerUserId: text("payer_user_id").references(() => user.id, { onDelete: "set null" }),
    // Credits the payer was charged, the share of their credits that were paid for (basis points,
    // 10000 = all paid) and the rate (basis points, 1000 = 10%), all as they were at charge time.
    charged: integer("charged").notNull(),
    paidRatioBp: integer("paid_ratio_bp").notNull(),
    rateBp: integer("rate_bp").notNull(),
    hundredths: integer("hundredths").notNull(),
    status: earningStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    settledAt: timestamp("settled_at"),
  },
  (t) => [
    uniqueIndex("creator_earning_source_idx").on(t.source, t.sourceRef),
    index("creator_earning_user_idx").on(t.userId, t.createdAt),
    index("creator_earning_subject_idx").on(t.userId, t.subjectRef),
  ],
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
  // The AI the creator chose for chat ("reelkar" is the free default), and their own key for it,
  // encrypted like OAuth tokens. Only the last 4 characters are ever shown back.
  aiProvider: text("ai_provider").notNull().default("reelkar"),
  aiModel: text("ai_model"),
  aiKey: text("ai_key"),
  aiKeyHint: text("ai_key_hint"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// The creator's own AI engines, tried in `position` order for every AI task before Reelkar's own
// lane. Keys are encrypted like OAuth tokens; only the last 4 characters are shown back. `extra`
// holds a second value a provider needs, such as a Cloudflare account id.
export const aiEngine = pgTable(
  "ai_engine",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    key: text("key"),
    keyHint: text("key_hint"),
    extra: text("extra"),
    position: integer("position").notNull().default(0),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("ai_engine_user_idx").on(t.userId, t.position)],
);

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

// OAuth 2.1 for the connector, so claude.ai, the Claude phone app and other assistants can sign in
// instead of using a pasted key. Clients come from dynamic client registration; clients whose id
// is a metadata-document URL aren't stored (their document is fetched instead).
export const oauthClient = pgTable("oauth_client", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  redirectUris: jsonb("redirect_uris").$type<string[]>().notNull(),
  // Set only for confidential clients (client_secret_basic or client_secret_post); SHA-256 hash.
  secretHash: text("secret_hash"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// One "connected app" on /connect: a creator allowed a client. Disconnecting deletes its codes and tokens.
export const oauthGrant = pgTable(
  "oauth_grant",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    clientId: text("client_id").notNull(),
    clientName: text("client_name").notNull(),
    redirectHost: text("redirect_host").notNull(),
    scope: text("scope").notNull(),
    // The MCP endpoint the tokens are for (RFC 8707); tokens are refused anywhere else.
    resource: text("resource").notNull(),
    timeZone: text("time_zone").notNull().default("Asia/Kolkata"),
    lastUsedAt: timestamp("last_used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("oauth_grant_user_idx").on(t.userId), uniqueIndex("oauth_grant_app_idx").on(t.userId, t.clientId, t.resource)],
);

export const oauthTokenKind = pgEnum("oauth_token_kind", ["code", "access", "refresh"]);

// Authorization codes, access tokens and refresh tokens, stored as SHA-256 hashes only.
// Codes and refresh tokens are single use: usedAt is set, and a second use revokes the whole grant.
export const oauthToken = pgTable(
  "oauth_token",
  {
    hash: text("hash").primaryKey(),
    grantId: uuid("grant_id")
      .notNull()
      .references(() => oauthGrant.id, { onDelete: "cascade" }),
    kind: oauthTokenKind("kind").notNull(),
    // Codes only: the exact redirect URI and the PKCE S256 challenge.
    redirectUri: text("redirect_uri"),
    codeChallenge: text("code_challenge"),
    expiresAt: timestamp("expires_at").notNull(),
    usedAt: timestamp("used_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("oauth_token_grant_idx").on(t.grantId)],
);

// Song gifts (design/community/flow-spec.md): a song sent as a link that opens with no sign-in.
export const giftOccasion = pgEnum("gift_occasion", ["birthday", "wedding", "eid", "diwali", "anniversary", "rakhi", "just_because"]);
// How the Arabic gift page addresses the person; null uses neutral wording.
export const giftAddress = pgEnum("gift_address", ["her", "him"]);

export const gift = pgTable(
  "gift",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The public link's code (reelkar.app/g/{token}); short, random, and never reused.
    token: text("token").notNull().unique(),
    songId: uuid("song_id")
      .notNull()
      .references(() => song.id, { onDelete: "cascade" }),
    senderId: text("sender_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    toName: text("to_name").notNull(),
    // How the sender signs it ("Bhaiya", "Mom"); empty uses their account name.
    fromName: text("from_name").notNull().default(""),
    occasion: giftOccasion("occasion").notNull(),
    note: text("note").notNull().default(""),
    // The sender's own photo as the cover; null uses the song's AI cover.
    coverPath: text("cover_path"),
    address: giftAddress("address"),
    // Set for a reply: the gift it answers. A reply goes to the person who sent that gift.
    replyToGiftId: uuid("reply_to_gift_id").references((): AnyPgColumn => gift.id, { onDelete: "set null" }),
    // The first reply to a gift is free (owner decision, 2026-11-06).
    freeReply: boolean("free_reply").notNull().default(false),
    // What the sender sees: whether it was opened, plays (one per browser per day) and when. Never who.
    openedAt: timestamp("opened_at"),
    playCount: integer("play_count").notNull().default(0),
    lastPlayedAt: timestamp("last_played_at"),
    // The sender stopped sharing; the link shows "not available any more" until shared again.
    revokedAt: timestamp("revoked_at"),
    takenDownAt: timestamp("taken_down_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("gift_sender_created_idx").on(t.senderId, t.createdAt), index("gift_reply_to_idx").on(t.replyToGiftId)],
);

// One row per browser per day that played a gift, so a replay doesn't inflate the count. The
// visitor is a random id in a first-party cookie, not an IP or device.
export const giftPlay = pgTable(
  "gift_play",
  {
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gift.id, { onDelete: "cascade" }),
    visitor: text("visitor").notNull(),
    day: text("day").notNull(),
  },
  (t) => [uniqueIndex("gift_play_once_idx").on(t.giftId, t.visitor, t.day)],
);

export const giftReportReason = pgEnum("gift_report_reason", ["voice_or_likeness", "copyright", "hateful", "minor_sexual", "other"]);

// Reports from the Report link on a public gift page (legally required); reviewed by a person.
export const giftReport = pgTable(
  "gift_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    giftId: uuid("gift_id")
      .notNull()
      .references(() => gift.id, { onDelete: "cascade" }),
    reason: giftReportReason("reason").notNull(),
    details: text("details").notNull().default(""),
    email: text("email"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("gift_report_gift_idx").on(t.giftId)],
);

// Reports from the Report button on every public song, with the gift reasons; reviewed by a person.
export const songReport = pgTable(
  "song_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    songId: uuid("song_id")
      .notNull()
      .references(() => song.id, { onDelete: "cascade" }),
    reason: giftReportReason("reason").notNull(),
    details: text("details").notNull().default(""),
    email: text("email"),
    reporterId: text("reporter_id").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("song_report_song_idx").on(t.songId)],
);

// Jugalbandi: a song two creators make from two phones (design/community/flow-spec.md, feature 2).
// waiting: A is recording or waiting for B; joining: the song is being made; ready: both approve;
// declined / cancelled: over; solo: A finished it alone. "No answer in 48 hours" is worked out from
// expiresAt, so no job has to run.
export const duetStatus = pgEnum("duet_status", ["waiting", "joining", "ready", "declined", "cancelled", "solo"]);
export const duetPartKind = pgEnum("duet_part_kind", ["hum", "sing"]);

export const duet = pgTable(
  "duet",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The invite link's code (reelkar.app/j/{token}); a new one when A invites someone else.
    token: text("token").notNull().unique(),
    starterId: text("starter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Whoever opened the invite and joined; null until then.
    partnerId: text("partner_id").references(() => user.id, { onDelete: "set null" }),
    starterName: text("starter_name").notNull(),
    partnerName: text("partner_name").notNull().default(""),
    // Instagram usernames for the Collab post (without @).
    starterIg: text("starter_ig").notNull().default(""),
    partnerIg: text("partner_ig").notNull().default(""),
    topic: text("topic").notNull(),
    genre: text("genre").notNull(),
    language: text("language").notNull(),
    status: duetStatus("status").notNull().default("waiting"),
    // Each part: its audio (copied from the Hum it take), what it was, and what was heard in it.
    partAPath: text("part_a_path"),
    partAKind: duetPartKind("part_a_kind"),
    partAText: text("part_a_text").notNull().default(""),
    partASec: integer("part_a_sec"),
    partBPath: text("part_b_path"),
    partBKind: duetPartKind("part_b_kind"),
    partBText: text("part_b_text").notNull().default(""),
    partBSec: integer("part_b_sec"),
    // The joined song (owned by A; B hears it through the duet).
    songId: uuid("song_id").references(() => song.id, { onDelete: "set null" }),
    // Credits each one paid: A pays at the start; B can offer half.
    paidA: integer("paid_a").notNull().default(0),
    paidB: integer("paid_b").notNull().default(0),
    retakesA: integer("retakes_a").notNull().default(0),
    retakesB: integer("retakes_b").notNull().default(0),
    approvedA: timestamp("approved_a"),
    approvedB: timestamp("approved_b"),
    // A asked B to sing their part again (or the other way round).
    retakeAskedOf: text("retake_asked_of"),
    declineNote: text("decline_note").notNull().default(""),
    // 48 hours from when A's part is in; "Give 24 more hours" works once.
    expiresAt: timestamp("expires_at"),
    extended: boolean("extended").notNull().default(false),
    // Invited by Instagram username: the Reelkar account that connected it, told in the app.
    invitedUserId: text("invited_user_id").references(() => user.id, { onDelete: "set null" }),
    invitedIg: text("invited_ig").notNull().default(""),
    // Each part may be sung in its own singer's consented voice (never the other's); each pays for theirs.
    voiceA: uuid("voice_a").references(() => voiceProfile.id, { onDelete: "set null" }),
    voiceB: uuid("voice_b").references(() => voiceProfile.id, { onDelete: "set null" }),
    paidVoiceA: integer("paid_voice_a").notNull().default(0),
    paidVoiceB: integer("paid_voice_b").notNull().default(0),
    // The 24-hour reminder went out.
    remindedAt: timestamp("reminded_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("duet_starter_idx").on(t.starterId, t.createdAt), index("duet_partner_idx").on(t.partnerId, t.createdAt)],
);

// Reports from the Report link on a public duet invite page.
export const duetReport = pgTable(
  "duet_report",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    duetId: uuid("duet_id")
      .notNull()
      .references(() => duet.id, { onDelete: "cascade" }),
    reason: giftReportReason("reason").notNull(),
    details: text("details").notNull().default(""),
    email: text("email"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("duet_report_duet_idx").on(t.duetId)],
);

export const pushPlatform = pgEnum("push_platform", ["ios", "android"]);
// The language pushes are written in: the phone's own, when it's one Reelkar writes.
export const pushLang = pgEnum("push_lang", ["en", "hi", "ar"]);

// Expo push tokens, one row per phone; a token moves to whoever signs in on that phone last.
// Deleted on sign-out, or when Expo says the phone no longer takes pushes.
export const pushToken = pgTable(
  "push_token",
  {
    token: text("token").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Null for phones that registered before the app sent it.
    platform: pushPlatform("platform"),
    lang: pushLang("lang").notNull().default("en"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("push_token_user_idx").on(t.userId)],
);

// Which pushes a creator wants (Account › Notifications). No row means all are on.
export const pushPrefs = pgTable("push_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  songs: boolean("songs").notNull().default(true),
  reels: boolean("reels").notNull().default(true),
  // Gifts and Jugalbandis.
  gifts: boolean("gifts").notNull().default(true),
  // Remixes of the creator's songs and what they earned.
  remixes: boolean("remixes").notNull().default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
