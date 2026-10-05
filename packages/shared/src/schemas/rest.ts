import { z } from "zod";
import { gameStatusSchema, idSchema, isoDateSchema, okAckSchema, pinSchema } from "./common.js";
import {
  quizDescriptionSchema,
  quizQuestionsSchema,
  quizSchema,
  quizSettingsSchema,
  quizTitleSchema,
  questionTypeSchema,
} from "./question.js";

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

export const healthResponseSchema = z.object({
  status: z.enum(["ok", "degraded"]),
  db: z.boolean(),
  redis: z.boolean(),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** POST /api/auth/login */
export const loginRequestSchema = z.object({ password: z.string().min(1).max(200) });
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** POST /api/auth/login success (session cookie set); 401 `WRONG_PASSWORD` on failure. */
export const loginResponseSchema = okAckSchema;

/** GET /api/auth/me */
export const authMeResponseSchema = z.object({ authenticated: z.boolean() });
export type AuthMeResponse = z.infer<typeof authMeResponseSchema>;

// ---------------------------------------------------------------------------
// Quizzes
// ---------------------------------------------------------------------------

/** GET /api/quizzes – one row. */
export const quizSummarySchema = z.object({
  id: idSchema,
  title: z.string(),
  questionCount: z.number().int().nonnegative(),
  updatedAt: isoDateSchema,
});
export type QuizSummary = z.infer<typeof quizSummarySchema>;

export const quizListResponseSchema = z.array(quizSummarySchema);
export type QuizListResponse = z.infer<typeof quizListResponseSchema>;

/** GET /api/quizzes/:id, POST /api/quizzes, POST /api/quizzes/:id/duplicate. */
export const quizDtoSchema = quizSchema.extend({
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});
export type QuizDto = z.infer<typeof quizDtoSchema>;

/** PUT /api/quizzes/:id – the whole quiz; questions are replaced in a transaction. */
export const quizUpdateRequestSchema = z.object({
  title: quizTitleSchema,
  description: quizDescriptionSchema,
  settings: quizSettingsSchema,
  questions: quizQuestionsSchema,
});
export type QuizUpdateRequest = z.infer<typeof quizUpdateRequestSchema>;

export const idParamsSchema = z.object({ id: idSchema });
export type IdParams = z.infer<typeof idParamsSchema>;

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

export const MEDIA_KINDS = ["image", "audio"] as const;
export const mediaKindSchema = z.enum(MEDIA_KINDS);
export type MediaKind = z.infer<typeof mediaKindSchema>;

/** Allowed upload MIME types → file extension. */
export const IMAGE_MIME_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export const AUDIO_MIME_TYPES = {
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
} as const;

export const IMAGE_MAX_DIMENSION = 1920;

/** POST /api/media response. */
export const mediaUploadResponseSchema = z.object({
  id: idSchema,
  url: z.string(),
  kind: mediaKindSchema,
  mime: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  duration: z.number().nonnegative().optional(),
});
export type MediaUploadResponse = z.infer<typeof mediaUploadResponseSchema>;

// ---------------------------------------------------------------------------
// Games
// ---------------------------------------------------------------------------

/** POST /api/games */
export const createGameRequestSchema = z.object({ quizId: idSchema });
export type CreateGameRequest = z.infer<typeof createGameRequestSchema>;

export const createGameResponseSchema = z.object({ pin: pinSchema, gameId: idSchema });
export type CreateGameResponse = z.infer<typeof createGameResponseSchema>;

export const pinParamsSchema = z.object({ pin: pinSchema });
export type PinParams = z.infer<typeof pinParamsSchema>;

/** GET /api/games/:pin/exists (public). */
export const gameExistsResponseSchema = z.object({ exists: z.boolean() });
export type GameExistsResponse = z.infer<typeof gameExistsResponseSchema>;

/** GET /api/games – history row. */
export const gameHistoryItemSchema = z.object({
  id: idSchema,
  quizId: idSchema.nullable(),
  quizTitle: z.string(),
  pin: z.string(),
  status: gameStatusSchema,
  createdAt: isoDateSchema,
  startedAt: isoDateSchema.nullable(),
  finishedAt: isoDateSchema.nullable(),
  playerCount: z.number().int().nonnegative(),
  winner: z.string().nullable(),
});
export type GameHistoryItem = z.infer<typeof gameHistoryItemSchema>;

export const gameHistoryResponseSchema = z.array(gameHistoryItemSchema);
export type GameHistoryResponse = z.infer<typeof gameHistoryResponseSchema>;

/** GET /api/games/:id/results (`?format=csv` returns text/csv instead). */
export const gameResultsQuerySchema = z.object({ format: z.enum(["json", "csv"]).default("json") });
export type GameResultsQuery = z.infer<typeof gameResultsQuerySchema>;

export const gameResultsResponseSchema = z.object({
  game: gameHistoryItemSchema,
  questions: z.array(
    z.object({ index: z.number().int().nonnegative(), type: questionTypeSchema, prompt: z.string(), points: z.number() }),
  ),
  players: z.array(
    z.object({
      id: idSchema,
      nickname: z.string(),
      score: z.number(),
      finalRank: z.number().int().positive().nullable(),
    }),
  ),
  answers: z.array(
    z.object({
      questionIndex: z.number().int().nonnegative(),
      playerId: idSchema,
      correctness: z.number().min(0).max(1),
      points: z.number(),
      answeredMs: z.number().int().nonnegative(),
    }),
  ),
});
export type GameResultsResponse = z.infer<typeof gameResultsResponseSchema>;

// ---------------------------------------------------------------------------
// Quiz create / duplicate bodies (optional)
// ---------------------------------------------------------------------------

/** Title used by `POST /api/quizzes` when the client sends none. */
export const DEFAULT_QUIZ_TITLE = "Nový kvíz";

/** POST /api/quizzes – optional body; missing title = `DEFAULT_QUIZ_TITLE`. */
export const quizCreateRequestSchema = z.object({ title: quizTitleSchema.optional() });
export type QuizCreateRequest = z.infer<typeof quizCreateRequestSchema>;

/** POST /api/quizzes/:id/duplicate – optional body; missing title = title of the original. */
export const quizDuplicateRequestSchema = z.object({ title: quizTitleSchema.optional() });
export type QuizDuplicateRequest = z.infer<typeof quizDuplicateRequestSchema>;
