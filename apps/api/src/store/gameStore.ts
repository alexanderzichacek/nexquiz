import { avatarSchema, DEFAULT_AVATAR, gameStateNameSchema, gameStatusSchema, type QuizSnapshot } from "@nexquiz/shared";
import { z } from "zod";

/**
 * Redis keys of a running game (LOGIC.md "Redis kľúče"). Every key gets the
 * TTL `GAME_TTL_HOURS`, refreshed on each write.
 */
export const redisKeys = {
  pin: (pin: string) => `pin:${pin}`,
  game: (pin: string) => `game:${pin}`,
  quiz: (pin: string) => `game:${pin}:quiz`,
  shuffle: (pin: string, idx: number) => `game:${pin}:shuffle:${idx}`,
  players: (pin: string) => `game:${pin}:players`,
  nicks: (pin: string) => `game:${pin}:nicks`,
  scores: (pin: string) => `game:${pin}:scores`,
  answers: (pin: string, idx: number) => `game:${pin}:q:${idx}:answers`,
  results: (pin: string, idx: number) => `game:${pin}:q:${idx}:results`,
  overrides: (pin: string) => `game:${pin}:overrides`,
} as const;

/** Key inside `game:{pin}:overrides`. */
export function overrideKey(questionIndex: number, fieldKey: string, normalized: string): string {
  return `${questionIndex}:${fieldKey}:${normalized}`;
}

/** `game:{pin}` hash. `questionStartedAt` / `deadline` are epoch ms (0 = none). */
export const gameMetaSchema = z.object({
  gameId: z.uuid(),
  status: gameStatusSchema,
  state: gameStateNameSchema,
  currentIndex: z.coerce.number().int().min(-1),
  questionStartedAt: z.coerce.number().int().nonnegative(),
  deadline: z.coerce.number().int().nonnegative(),
});
export type GameMeta = z.infer<typeof gameMetaSchema>;

/** Value in `game:{pin}:players`. */
export const playerRecordSchema = z.object({
  nickname: z.string(),
  /** Default for records written before avatars existed. */
  avatar: avatarSchema.default(DEFAULT_AVATAR),
  tokenHash: z.string(),
  connected: z.boolean(),
  joinedAt: z.number().int(),
});
export type PlayerRecord = z.infer<typeof playerRecordSchema>;

/** Value in `game:{pin}:q:{idx}:answers` (validated payload, server receive time). */
export const answerRecordSchema = z.object({
  payload: z.unknown(),
  receivedAt: z.number().int(),
});
export type AnswerRecord = z.infer<typeof answerRecordSchema>;

/**
 * Value in `game:{pin}:q:{idx}:results`. `answeredMs` is kept so that a host
 * override can recompute points after the question is over.
 */
export const resultRecordSchema = z.object({
  correctness: z.number().min(0).max(1),
  points: z.number().nonnegative(),
  answeredMs: z.number().int().nonnegative(),
  perField: z.record(z.string(), z.boolean()).optional(),
});
export type ResultRecord = z.infer<typeof resultRecordSchema>;

/**
 * Storage of the running game state. Implemented by `RedisGameStore`; tests
 * use `MemoryGameStore`.
 */
export interface GameStore {
  /** `SET pin:{pin} {gameId} NX EX ttl`; false when the PIN is taken. */
  reservePin(pin: string, gameId: string): Promise<boolean>;
  releasePin(pin: string): Promise<void>;
  getPinGameId(pin: string): Promise<string | null>;
  /** PINs of all reserved (not yet finished) games. */
  listActivePins(): Promise<string[]>;
  /** Removes every `game:{pin}*` key (stale data of a previous game with the same PIN). */
  clearGame(pin: string): Promise<void>;

  initGame(pin: string, meta: GameMeta, snapshot: QuizSnapshot): Promise<void>;
  getMeta(pin: string): Promise<GameMeta | null>;
  updateMeta(pin: string, patch: Partial<GameMeta>): Promise<void>;
  getSnapshot(pin: string): Promise<QuizSnapshot | null>;

  setShuffle(pin: string, idx: number, ids: readonly string[]): Promise<void>;
  getShuffle(pin: string, idx: number): Promise<string[] | null>;

  /** `SADD`; false when the normalized nickname already exists. */
  addNick(pin: string, nickKey: string): Promise<boolean>;
  removeNick(pin: string, nickKey: string): Promise<void>;

  setPlayer(pin: string, playerId: string, player: PlayerRecord): Promise<void>;
  getPlayer(pin: string, playerId: string): Promise<PlayerRecord | null>;
  getPlayers(pin: string): Promise<Map<string, PlayerRecord>>;
  removePlayer(pin: string, playerId: string): Promise<void>;

  setScores(pin: string, scores: ReadonlyMap<string, number>): Promise<void>;
  getScores(pin: string): Promise<Map<string, number>>;
  removeScore(pin: string, playerId: string): Promise<void>;

  /** `HSETNX`; false when the player already answered this question. */
  addAnswer(pin: string, idx: number, playerId: string, answer: AnswerRecord): Promise<boolean>;
  getAnswers(pin: string, idx: number): Promise<Map<string, AnswerRecord>>;

  setResults(pin: string, idx: number, results: ReadonlyMap<string, ResultRecord>): Promise<void>;
  getResults(pin: string, idx: number): Promise<Map<string, ResultRecord>>;
  /** Results of questions `0..lastIdx` (index = question index). */
  getResultsUpTo(pin: string, lastIdx: number): Promise<Map<string, ResultRecord>[]>;

  setOverride(pin: string, key: string, accept: boolean): Promise<void>;
  getOverrides(pin: string): Promise<Map<string, boolean>>;
}
