import { z } from "zod";

/** UUID used for every persistent entity (quiz, question, media, game, player). */
export const idSchema = z.uuid();
export type Id = z.infer<typeof idSchema>;

/** Short client-side identifier of an option / item inside one question. */
export const localIdSchema = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const PIN_LENGTH = 6;

/** Canonical 6-digit game PIN (no whitespace). */
export const pinSchema = z.string().regex(/^\d{6}$/);
export type Pin = z.infer<typeof pinSchema>;

/** Accepts user input such as `123 456` and strips all whitespace. */
export function normalizePinInput(input: string): string {
  return input.replace(/\s+/g, "");
}

/** Formats a PIN for display: `123456` → `123 456`. */
export function formatPin(pin: string): string {
  return pin.length === PIN_LENGTH ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin;
}

export const NICKNAME_MAX = 20;

export const nicknameSchema = z.string().trim().min(1).max(NICKNAME_MAX);

/**
 * Key used to check nickname uniqueness within a game:
 * case-insensitive and diacritics-insensitive.
 */
export function nicknameKey(nickname: string): string {
  return nickname
    .trim()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

/** Opaque player token returned by `player:join` (server stores only its hash). */
export const playerTokenSchema = z.string().min(16).max(256);

/** Game state machine states (Redis `game:{pin}.state`). */
export const GAME_STATES = ["LOBBY", "QUESTION", "REVEAL", "LEADERBOARD", "FINISHED"] as const;
export const gameStateNameSchema = z.enum(GAME_STATES);
export type GameStateName = z.infer<typeof gameStateNameSchema>;

/** Persistent game status (Postgres `games.status`). */
export const GAME_STATUSES = ["lobby", "running", "finished"] as const;
export const gameStatusSchema = z.enum(GAME_STATUSES);
export type GameStatus = z.infer<typeof gameStatusSchema>;

/** Stable error codes sent to clients (never stack traces). */
export const ERROR_CODES = [
  "PIN_NOT_FOUND",
  "NICK_TAKEN",
  "GAME_FINISHED",
  "LATE",
  "ALREADY_ANSWERED",
  "INVALID",
  "INVALID_TOKEN",
  "INVALID_TRANSITION",
  "UNAUTHORIZED",
  "WRONG_PASSWORD",
  "NOT_FOUND",
  "RATE_LIMITED",
  "PAYLOAD_TOO_LARGE",
  "UNSUPPORTED_MEDIA_TYPE",
  "INTERNAL",
] as const;
export const errorCodeSchema = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorResponseSchema = z.object({
  error: errorCodeSchema,
});
export type ErrorResponse = z.infer<typeof errorResponseSchema>;

/** Generic `ok` acknowledgement. */
export const okAckSchema = z.object({ ok: z.literal(true) });
export type OkAck = z.infer<typeof okAckSchema>;

/** Ack that is either `{ ok: true }` or `{ error }`. */
export const okOrErrorAckSchema = z.union([okAckSchema, errorResponseSchema]);
export type OkOrErrorAck = z.infer<typeof okOrErrorAckSchema>;

/** ISO 8601 timestamp string as sent over REST. */
export const isoDateSchema = z.iso.datetime({ offset: true });
