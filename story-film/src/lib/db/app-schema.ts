import { relations } from "drizzle-orm";
import { index, integer, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

export const filmStyle = pgEnum("film_style", ["cinematic", "animated", "photoreal"]);
export const filmStatus = pgEnum("film_status", ["queued", "running", "completed", "failed"]);

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
    story: text("story").notNull(),
    style: filmStyle("style").notNull(),
    durationSec: integer("duration_sec").notNull(),
    status: filmStatus("status").default("queued").notNull(),
    stage: text("stage"),
    title: text("title"),
    outputPath: text("output_path"),
    error: text("error"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
  },
  (t) => [index("film_user_created_idx").on(t.userId, t.createdAt)],
);

export const characterRelations = relations(character, ({ one, many }) => ({
  user: one(user, { fields: [character.userId], references: [user.id] }),
  films: many(film),
}));

export const filmRelations = relations(film, ({ one }) => ({
  user: one(user, { fields: [film.userId], references: [user.id] }),
  character: one(character, { fields: [film.characterId], references: [character.id] }),
}));
