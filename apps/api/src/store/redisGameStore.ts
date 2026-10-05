import { quizSnapshotSchema, type QuizSnapshot } from "@nexquiz/shared";
import type { Redis } from "ioredis";
import { z } from "zod";
import {
  answerRecordSchema,
  gameMetaSchema,
  playerRecordSchema,
  redisKeys,
  resultRecordSchema,
  type AnswerRecord,
  type GameMeta,
  type GameStore,
  type PlayerRecord,
  type ResultRecord,
} from "./gameStore.js";

const shuffleSchema = z.array(z.string());

function parseJson<T>(schema: z.ZodType<T>, raw: string | null | undefined): T | null {
  if (raw == null) return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function parseHash<T>(schema: z.ZodType<T>, hash: Record<string, string>): Map<string, T> {
  const out = new Map<string, T>();
  for (const [field, raw] of Object.entries(hash)) {
    const value = parseJson(schema, raw);
    if (value !== null) out.set(field, value);
  }
  return out;
}

function metaToHash(meta: Partial<GameMeta>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(meta)) {
    if (value !== undefined) out[key] = String(value);
  }
  return out;
}

/** Redis implementation of `GameStore` (ioredis). All keys carry a TTL. */
export class RedisGameStore implements GameStore {
  constructor(
    private readonly redis: Redis,
    private readonly ttlSeconds: number,
  ) {}

  async reservePin(pin: string, gameId: string): Promise<boolean> {
    const res = await this.redis.set(redisKeys.pin(pin), gameId, "EX", this.ttlSeconds, "NX");
    return res === "OK";
  }

  async releasePin(pin: string): Promise<void> {
    await this.redis.del(redisKeys.pin(pin));
  }

  async getPinGameId(pin: string): Promise<string | null> {
    return this.redis.get(redisKeys.pin(pin));
  }

  async listActivePins(): Promise<string[]> {
    const pins: string[] = [];
    let cursor = "0";
    do {
      const [next, keys] = await this.redis.scan(cursor, "MATCH", "pin:*", "COUNT", 200);
      cursor = next;
      for (const key of keys) pins.push(key.slice("pin:".length));
    } while (cursor !== "0");
    return pins;
  }

  async clearGame(pin: string): Promise<void> {
    const keys = [redisKeys.game(pin)];
    let cursor = "0";
    do {
      const [next, found] = await this.redis.scan(cursor, "MATCH", `game:${pin}:*`, "COUNT", 500);
      cursor = next;
      keys.push(...found);
    } while (cursor !== "0");
    await this.redis.del(...keys);
  }

  async initGame(pin: string, meta: GameMeta, snapshot: QuizSnapshot): Promise<void> {
    await this.redis
      .multi()
      .hset(redisKeys.game(pin), metaToHash(meta))
      .expire(redisKeys.game(pin), this.ttlSeconds)
      .set(redisKeys.quiz(pin), JSON.stringify(snapshot), "EX", this.ttlSeconds)
      .exec();
  }

  async getMeta(pin: string): Promise<GameMeta | null> {
    const hash = await this.redis.hgetall(redisKeys.game(pin));
    if (Object.keys(hash).length === 0) return null;
    const result = gameMetaSchema.safeParse(hash);
    return result.success ? result.data : null;
  }

  async updateMeta(pin: string, patch: Partial<GameMeta>): Promise<void> {
    await this.redis
      .multi()
      .hset(redisKeys.game(pin), metaToHash(patch))
      .expire(redisKeys.game(pin), this.ttlSeconds)
      .expire(redisKeys.quiz(pin), this.ttlSeconds)
      .expire(redisKeys.pin(pin), this.ttlSeconds)
      .exec();
  }

  async getSnapshot(pin: string): Promise<QuizSnapshot | null> {
    return parseJson(quizSnapshotSchema, await this.redis.get(redisKeys.quiz(pin)));
  }

  async setShuffle(pin: string, idx: number, ids: readonly string[]): Promise<void> {
    await this.redis.set(redisKeys.shuffle(pin, idx), JSON.stringify(ids), "EX", this.ttlSeconds);
  }

  async getShuffle(pin: string, idx: number): Promise<string[] | null> {
    return parseJson(shuffleSchema, await this.redis.get(redisKeys.shuffle(pin, idx)));
  }

  async addNick(pin: string, nickKey: string): Promise<boolean> {
    const key = redisKeys.nicks(pin);
    const [added] = await this.execAll(this.redis.multi().sadd(key, nickKey).expire(key, this.ttlSeconds));
    return added === 1;
  }

  async removeNick(pin: string, nickKey: string): Promise<void> {
    await this.redis.srem(redisKeys.nicks(pin), nickKey);
  }

  async setPlayer(pin: string, playerId: string, player: PlayerRecord): Promise<void> {
    const key = redisKeys.players(pin);
    await this.redis.multi().hset(key, playerId, JSON.stringify(player)).expire(key, this.ttlSeconds).exec();
  }

  async getPlayer(pin: string, playerId: string): Promise<PlayerRecord | null> {
    return parseJson(playerRecordSchema, await this.redis.hget(redisKeys.players(pin), playerId));
  }

  async getPlayers(pin: string): Promise<Map<string, PlayerRecord>> {
    return parseHash(playerRecordSchema, await this.redis.hgetall(redisKeys.players(pin)));
  }

  async removePlayer(pin: string, playerId: string): Promise<void> {
    await this.redis.hdel(redisKeys.players(pin), playerId);
  }

  async setScores(pin: string, scores: ReadonlyMap<string, number>): Promise<void> {
    if (scores.size === 0) return;
    const key = redisKeys.scores(pin);
    const args: (string | number)[] = [];
    for (const [playerId, score] of scores) args.push(score, playerId);
    await this.redis.multi().zadd(key, ...args).expire(key, this.ttlSeconds).exec();
  }

  async getScores(pin: string): Promise<Map<string, number>> {
    const flat = await this.redis.zrange(redisKeys.scores(pin), "0", "-1", "WITHSCORES");
    const out = new Map<string, number>();
    for (let i = 0; i + 1 < flat.length; i += 2) {
      const id = flat[i];
      const score = Number(flat[i + 1]);
      if (id !== undefined && Number.isFinite(score)) out.set(id, score);
    }
    return out;
  }

  async removeScore(pin: string, playerId: string): Promise<void> {
    await this.redis.zrem(redisKeys.scores(pin), playerId);
  }

  async addAnswer(pin: string, idx: number, playerId: string, answer: AnswerRecord): Promise<boolean> {
    const key = redisKeys.answers(pin, idx);
    const [added] = await this.execAll(
      this.redis.multi().hsetnx(key, playerId, JSON.stringify(answer)).expire(key, this.ttlSeconds),
    );
    return added === 1;
  }

  async getAnswers(pin: string, idx: number): Promise<Map<string, AnswerRecord>> {
    return parseHash(answerRecordSchema, await this.redis.hgetall(redisKeys.answers(pin, idx)));
  }

  async setResults(pin: string, idx: number, results: ReadonlyMap<string, ResultRecord>): Promise<void> {
    if (results.size === 0) return;
    const key = redisKeys.results(pin, idx);
    const values: Record<string, string> = {};
    for (const [playerId, result] of results) values[playerId] = JSON.stringify(result);
    await this.redis.multi().hset(key, values).expire(key, this.ttlSeconds).exec();
  }

  async getResults(pin: string, idx: number): Promise<Map<string, ResultRecord>> {
    return parseHash(resultRecordSchema, await this.redis.hgetall(redisKeys.results(pin, idx)));
  }

  async getResultsUpTo(pin: string, lastIdx: number): Promise<Map<string, ResultRecord>[]> {
    if (lastIdx < 0) return [];
    const pipeline = this.redis.pipeline();
    for (let i = 0; i <= lastIdx; i++) pipeline.hgetall(redisKeys.results(pin, i));
    const replies = (await pipeline.exec()) ?? [];
    return replies.map(([err, hash]) => {
      if (err) throw err;
      return parseHash(resultRecordSchema, isStringRecord(hash) ? hash : {});
    });
  }

  async setOverride(pin: string, key: string, accept: boolean): Promise<void> {
    const hashKey = redisKeys.overrides(pin);
    await this.redis
      .multi()
      .hset(hashKey, key, accept ? "1" : "0")
      .expire(hashKey, this.ttlSeconds)
      .exec();
  }

  async getOverrides(pin: string): Promise<Map<string, boolean>> {
    const hash = await this.redis.hgetall(redisKeys.overrides(pin));
    return new Map(Object.entries(hash).map(([key, value]) => [key, value === "1"]));
  }

  /** Runs a MULTI and returns the reply of each command (throws on any error). */
  private async execAll(multi: ReturnType<Redis["multi"]>): Promise<unknown[]> {
    const replies = (await multi.exec()) ?? [];
    return replies.map(([err, value]) => {
      if (err) throw err;
      return value;
    });
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && Object.values(value).every((v) => typeof v === "string");
}
