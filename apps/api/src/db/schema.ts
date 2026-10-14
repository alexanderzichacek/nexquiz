import type { QuizSettings } from "@nexquiz/shared";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Postgres schema – mirrors LOGIC.md "Dátový model".
 *
 * `numeric` columns are returned by the driver as strings; convert them at the
 * repository boundary. `jsonb` columns are validated with the Zod schemas from
 * `@nexquiz/shared` when read and written.
 *
 * The `unique (quiz_id, position) deferrable initially deferred` constraint
 * cannot be expressed in Drizzle; it is declared here as a plain unique
 * constraint and made deferrable by the custom migration
 * `0001_questions_position_deferrable.sql`.
 */

export const media = pgTable(
  "media",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind", { enum: ["image", "audio", "video"] }).notNull(),
    mime: text("mime").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    width: integer("width"),
    height: integer("height"),
    durationS: numeric("duration_s", { precision: 8, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("media_kind_check", sql`${t.kind} in ('image','audio','video')`)],
);

export const quizzes = pgTable("quizzes", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  description: text("description"),
  settings: jsonb("settings")
    .$type<QuizSettings>()
    .notNull()
    .default(sql`'{"speedBonus":true,"showLeaderboardAfterEach":true,"shuffleOptions":false}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const questions = pgTable(
  "questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id")
      .notNull()
      .references(() => quizzes.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    type: text("type", { enum: ["single", "multi", "order", "hotspot", "text", "music", "number", "page"] }).notNull(),
    /** Question text; the title of a `page`. */
    prompt: text("prompt").notNull(),
    imageId: uuid("image_id").references(() => media.id),
    audioId: uuid("audio_id").references(() => media.id),
    videoId: uuid("video_id").references(() => media.id),
    /** A `page` has no time limit and no points: it stores the column defaults. */
    timeLimit: integer("time_limit").notNull().default(30),
    points: numeric("points", { precision: 6, scale: 2 }).notNull().default("1000"),
    /** Validated by the Zod schema for `type`; `{ description }` for a `page`. */
    data: jsonb("data").$type<unknown>().notNull(),
  },
  (t) => [
    check("questions_type_check", sql`${t.type} in ('single','multi','order','hotspot','text','music','number','page')`),
    check("questions_time_limit_check", sql`${t.timeLimit} between 5 and 120`),
    unique("questions_quiz_id_position_key").on(t.quizId, t.position),
  ],
);

export const games = pgTable(
  "games",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    quizId: uuid("quiz_id").references(() => quizzes.id, { onDelete: "set null" }),
    pin: text("pin").notNull(),
    status: text("status", { enum: ["lobby", "running", "finished"] }).notNull(),
    quizSnapshot: jsonb("quiz_snapshot").$type<unknown>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [check("games_status_check", sql`${t.status} in ('lobby','running','finished')`)],
);

export const gamePlayers = pgTable("game_players", {
  id: uuid("id").primaryKey().defaultRandom(),
  gameId: uuid("game_id")
    .notNull()
    .references(() => games.id, { onDelete: "cascade" }),
  nickname: text("nickname").notNull(),
  // Totals of games with thousands of points per question: 200 × 9999 does not fit into 8 digits.
  score: numeric("score", { precision: 10, scale: 2 }).notNull().default("0"),
  finalRank: integer("final_rank"),
});

export const gameAnswers = pgTable(
  "game_answers",
  {
    gameId: uuid("game_id")
      .notNull()
      .references(() => games.id, { onDelete: "cascade" }),
    questionIndex: integer("question_index").notNull(),
    playerId: uuid("player_id")
      .notNull()
      .references(() => gamePlayers.id, { onDelete: "cascade" }),
    payload: jsonb("payload").$type<unknown>().notNull(),
    correctness: numeric("correctness", { precision: 4, scale: 3 }).notNull(),
    points: numeric("points", { precision: 8, scale: 2 }).notNull(),
    answeredMs: integer("answered_ms").notNull(),
  },
  (t) => [primaryKey({ columns: [t.gameId, t.questionIndex, t.playerId] })],
);

export type MediaRow = typeof media.$inferSelect;
export type QuizRow = typeof quizzes.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type GameRow = typeof games.$inferSelect;
export type GamePlayerRow = typeof gamePlayers.$inferSelect;
export type GameAnswerRow = typeof gameAnswers.$inferSelect;
