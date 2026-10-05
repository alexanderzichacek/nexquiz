import type { QuizSnapshot } from "@nexquiz/shared";
import type { AnswerRecord, GameMeta, GameStore, PlayerRecord, ResultRecord } from "./gameStore.js";

interface MemoryGame {
  meta: GameMeta | null;
  snapshot: QuizSnapshot | null;
  shuffles: Map<number, string[]>;
  players: Map<string, PlayerRecord>;
  nicks: Set<string>;
  scores: Map<string, number>;
  answers: Map<number, Map<string, AnswerRecord>>;
  results: Map<number, Map<string, ResultRecord>>;
  overrides: Map<string, boolean>;
}

/**
 * In-memory `GameStore` for tests (no TTL). Values are deep-cloned on the way
 * in and out so that tests behave like the JSON round trip through Redis.
 */
export class MemoryGameStore implements GameStore {
  readonly pins = new Map<string, string>();
  private readonly games = new Map<string, MemoryGame>();

  private game(pin: string): MemoryGame {
    let g = this.games.get(pin);
    if (!g) {
      g = {
        meta: null,
        snapshot: null,
        shuffles: new Map(),
        players: new Map(),
        nicks: new Set(),
        scores: new Map(),
        answers: new Map(),
        results: new Map(),
        overrides: new Map(),
      };
      this.games.set(pin, g);
    }
    return g;
  }

  async reservePin(pin: string, gameId: string): Promise<boolean> {
    if (this.pins.has(pin)) return false;
    this.pins.set(pin, gameId);
    return true;
  }

  async releasePin(pin: string): Promise<void> {
    this.pins.delete(pin);
  }

  async getPinGameId(pin: string): Promise<string | null> {
    return this.pins.get(pin) ?? null;
  }

  async listActivePins(): Promise<string[]> {
    return [...this.pins.keys()];
  }

  async clearGame(pin: string): Promise<void> {
    this.games.delete(pin);
  }

  async initGame(pin: string, meta: GameMeta, snapshot: QuizSnapshot): Promise<void> {
    const g = this.game(pin);
    g.meta = { ...meta };
    g.snapshot = structuredClone(snapshot);
  }

  async getMeta(pin: string): Promise<GameMeta | null> {
    const meta = this.games.get(pin)?.meta;
    return meta ? { ...meta } : null;
  }

  async updateMeta(pin: string, patch: Partial<GameMeta>): Promise<void> {
    const g = this.game(pin);
    if (!g.meta) return;
    const defined: Partial<GameMeta> = Object.fromEntries(
      Object.entries(patch).filter(([, value]) => value !== undefined),
    );
    g.meta = { ...g.meta, ...defined };
  }

  async getSnapshot(pin: string): Promise<QuizSnapshot | null> {
    const snapshot = this.games.get(pin)?.snapshot;
    return snapshot ? structuredClone(snapshot) : null;
  }

  async setShuffle(pin: string, idx: number, ids: readonly string[]): Promise<void> {
    this.game(pin).shuffles.set(idx, [...ids]);
  }

  async getShuffle(pin: string, idx: number): Promise<string[] | null> {
    const ids = this.games.get(pin)?.shuffles.get(idx);
    return ids ? [...ids] : null;
  }

  async addNick(pin: string, nickKey: string): Promise<boolean> {
    const nicks = this.game(pin).nicks;
    if (nicks.has(nickKey)) return false;
    nicks.add(nickKey);
    return true;
  }

  async removeNick(pin: string, nickKey: string): Promise<void> {
    this.games.get(pin)?.nicks.delete(nickKey);
  }

  async setPlayer(pin: string, playerId: string, player: PlayerRecord): Promise<void> {
    this.game(pin).players.set(playerId, { ...player });
  }

  async getPlayer(pin: string, playerId: string): Promise<PlayerRecord | null> {
    const p = this.games.get(pin)?.players.get(playerId);
    return p ? { ...p } : null;
  }

  async getPlayers(pin: string): Promise<Map<string, PlayerRecord>> {
    const players = this.games.get(pin)?.players ?? new Map<string, PlayerRecord>();
    return new Map([...players].map(([id, p]) => [id, { ...p }]));
  }

  async removePlayer(pin: string, playerId: string): Promise<void> {
    this.games.get(pin)?.players.delete(playerId);
  }

  async setScores(pin: string, scores: ReadonlyMap<string, number>): Promise<void> {
    const target = this.game(pin).scores;
    for (const [id, score] of scores) target.set(id, score);
  }

  async getScores(pin: string): Promise<Map<string, number>> {
    return new Map(this.games.get(pin)?.scores ?? []);
  }

  async removeScore(pin: string, playerId: string): Promise<void> {
    this.games.get(pin)?.scores.delete(playerId);
  }

  async addAnswer(pin: string, idx: number, playerId: string, answer: AnswerRecord): Promise<boolean> {
    const g = this.game(pin);
    let answers = g.answers.get(idx);
    if (!answers) {
      answers = new Map();
      g.answers.set(idx, answers);
    }
    if (answers.has(playerId)) return false;
    answers.set(playerId, structuredClone(answer));
    return true;
  }

  async getAnswers(pin: string, idx: number): Promise<Map<string, AnswerRecord>> {
    const answers = this.games.get(pin)?.answers.get(idx) ?? new Map<string, AnswerRecord>();
    return new Map([...answers].map(([id, a]) => [id, structuredClone(a)]));
  }

  async setResults(pin: string, idx: number, results: ReadonlyMap<string, ResultRecord>): Promise<void> {
    const g = this.game(pin);
    const target = g.results.get(idx) ?? new Map<string, ResultRecord>();
    for (const [id, r] of results) target.set(id, structuredClone(r));
    g.results.set(idx, target);
  }

  async getResults(pin: string, idx: number): Promise<Map<string, ResultRecord>> {
    const results = this.games.get(pin)?.results.get(idx) ?? new Map<string, ResultRecord>();
    return new Map([...results].map(([id, r]) => [id, structuredClone(r)]));
  }

  async getResultsUpTo(pin: string, lastIdx: number): Promise<Map<string, ResultRecord>[]> {
    const out: Map<string, ResultRecord>[] = [];
    for (let i = 0; i <= lastIdx; i++) out.push(await this.getResults(pin, i));
    return out;
  }

  async setOverride(pin: string, key: string, accept: boolean): Promise<void> {
    this.game(pin).overrides.set(key, accept);
  }

  async getOverrides(pin: string): Promise<Map<string, boolean>> {
    return new Map(this.games.get(pin)?.overrides ?? []);
  }
}
