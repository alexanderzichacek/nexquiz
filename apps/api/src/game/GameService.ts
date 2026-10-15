import { createHash, randomBytes, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import {
  ANSWER_GRACE_MS,
  DEFAULT_AVATAR,
  fromHundredths,
  hostGameStateSchema,
  idSchema,
  isPage,
  isQuestion,
  nicknameKey,
  parseAnswerPayload,
  playerGameStateSchema,
  playerResultEventSchema,
  questionCount,
  questionNumber,
  type Avatar,
  type Clip,
  type CreateGameResponse,
  type ExplanationShowEvent,
  type GameStateName,
  type HostGameState,
  type HostOverridePayload,
  type LeaderboardEvent,
  type LobbyPlayer,
  type Page,
  type PageShowEvent,
  type PlayerAnswerAck,
  type PlayerGameState,
  type PlayerResultEvent,
  type QuestionProgressEvent,
  type QuestionRevealEvent,
  type QuestionStartEvent,
  type Question,
  type QuizSnapshot,
} from "@nexquiz/shared";
import { AppError } from "../errors.js";
import {
  overrideKey,
  type AnswerRecord,
  type GameMeta,
  type GameStore,
  type PlayerRecord,
  type ResultRecord,
} from "../store/gameStore.js";
import { KeyedMutex } from "./mutex.js";
import type { GameLogger, GameNotifier, GamePersistence, PersistedAnswer, QuizSource } from "./ports.js";
import { buildReveal } from "./reveal.js";
import {
  buildCorrectAnswer,
  buildExplanationShow,
  buildPageShow,
  buildQuestionStart,
  explanationForPlayers,
  forPlayers,
} from "./sanitize.js";
import type { Scheduler } from "./scheduler.js";
import { imageAspectOf, scoreQuestion, type ScoredAnswer } from "./scoring.js";
import { cryptoRandomInt, presentationOrder, type RandomInt } from "./shuffle.js";
import { buildFinished, buildLeaderboard, computeStandings, type Standing } from "./standings.js";
import { assertTransition } from "./stateMachine.js";

export interface GameServiceDeps {
  store: GameStore;
  persistence: GamePersistence;
  quizzes: QuizSource;
  notifier: GameNotifier;
  scheduler: Scheduler;
  log: GameLogger;
  /** Server clock (epoch ms). */
  now?: () => number;
  random?: RandomInt;
  newId?: () => string;
}

/** Everything needed to work with one game, loaded inside the game lock. */
interface GameContext {
  pin: string;
  meta: GameMeta;
  snapshot: QuizSnapshot;
}

/** Max. attempts to find a free PIN. */
const PIN_ATTEMPTS = 50;
const SNAPSHOT_CACHE_MAX = 100;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Tokens have the form `{playerId}.{secret}`; returns the player id part. */
function playerIdFromToken(token: string): string | null {
  const id = token.slice(0, token.indexOf("."));
  return idSchema.safeParse(id).success ? id : null;
}

function lobbyList(players: ReadonlyMap<string, PlayerRecord>): LobbyPlayer[] {
  return [...players]
    .sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
    .map(([id, p]) => ({ id, nickname: p.nickname, avatar: p.avatar, connected: p.connected }));
}

function onlyPlayers<T>(entries: ReadonlyMap<string, T>, players: ReadonlyMap<string, PlayerRecord>): Map<string, T> {
  return new Map([...entries].filter(([id]) => players.has(id)));
}

/**
 * Game logic and the state machine of a running game. State lives in the
 * `GameStore` (Redis); only the question timers and the per-game lock are
 * in process memory. All mutations of one game run serialized under its lock
 * and every state change goes through `transition()`.
 */
export class GameService {
  private readonly mutex = new KeyedMutex();
  private readonly snapshots = new Map<string, QuizSnapshot>();
  private readonly now: () => number;
  private readonly random: RandomInt;
  private readonly newId: () => string;

  constructor(private readonly deps: GameServiceDeps) {
    this.now = deps.now ?? Date.now;
    this.random = deps.random ?? cryptoRandomInt;
    this.newId = deps.newId ?? randomUUID;
  }

  /** Server clock used for all game timing (`receivedAt`, deadlines). */
  serverNow(): number {
    return this.now();
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  /** `POST /api/games`: snapshots the quiz, reserves a PIN and initializes Redis. */
  async createGame(quizId: string): Promise<CreateGameResponse> {
    const source = await this.deps.quizzes.loadForSnapshot(quizId);
    if (!source) throw new AppError("NOT_FOUND");
    // A quiz of pages only has nothing to play.
    if (!source.quiz.questions.some(isQuestion)) throw new AppError("INVALID");

    const snapshot: QuizSnapshot = { ...source.quiz, images: source.images, takenAt: this.now() };
    const gameId = this.newId();
    const pin = await this.reservePin(gameId);
    try {
      await this.deps.store.clearGame(pin);
      await this.deps.persistence.createGame({ id: gameId, quizId, pin, snapshot });
      await this.deps.store.initGame(
        pin,
        { gameId, status: "lobby", state: "LOBBY", currentIndex: -1, questionStartedAt: 0, deadline: 0 },
        snapshot,
      );
    } catch (err) {
      await this.deps.store.releasePin(pin);
      throw err;
    }
    this.cacheSnapshot(gameId, snapshot);
    this.deps.log.info({ pin, gameId, quizId }, "game created");
    return { pin, gameId };
  }

  /** `GET /api/games/:pin/exists`: an active (not finished) game uses the PIN. */
  async gameExists(pin: string): Promise<boolean> {
    if ((await this.deps.store.getPinGameId(pin)) === null) return false;
    const meta = await this.deps.store.getMeta(pin);
    return meta !== null && meta.state !== "FINISHED";
  }

  /**
   * Startup recovery: re-creates question timers from the deadlines stored in
   * Redis and marks every player disconnected (no sockets survive a restart;
   * clients flip back to connected with `player:rejoin`). Single-instance
   * assumption, see LOGIC.md "Timery".
   */
  async restoreTimers(): Promise<number> {
    let restored = 0;
    for (const pin of await this.deps.store.listActivePins()) {
      await this.mutex.run(pin, async () => {
        for (const [playerId, player] of await this.deps.store.getPlayers(pin)) {
          if (player.connected) await this.deps.store.setPlayer(pin, playerId, { ...player, connected: false });
        }
      });
      const meta = await this.deps.store.getMeta(pin);
      if (meta?.state === "QUESTION") {
        this.scheduleDeadline(pin, meta.currentIndex, meta.deadline);
        restored++;
      }
    }
    return restored;
  }

  // -------------------------------------------------------------------------
  // Host intents
  // -------------------------------------------------------------------------

  /** `host:attach`: complete host snapshot. */
  attachHost(pin: string): Promise<HostGameState> {
    return this.locked(pin, (ctx) => this.hostState(ctx));
  }

  /** `host:start`: LOBBY → QUESTION / PAGE (the first item; needs ≥ 1 player). */
  start(pin: string): Promise<void> {
    return this.locked(pin, async (ctx) => {
      // host:start is the LOBBY → first item edge only (later items are entered with host:next).
      if (ctx.meta.state !== "LOBBY") throw new AppError("INVALID_TRANSITION");
      const players = await this.deps.store.getPlayers(pin);
      if (players.size === 0) throw new AppError("INVALID");
      await this.transition(ctx, this.stateOfNextItem(ctx));
    });
  }

  /** `host:next`: REVEAL / EXPLANATION / LEADERBOARD / PAGE → EXPLANATION / LEADERBOARD / QUESTION / PAGE / FINISHED. */
  next(pin: string): Promise<void> {
    return this.locked(pin, async (ctx) => {
      let to: GameStateName;
      if (ctx.meta.state === "REVEAL" && this.questionAt(ctx, ctx.meta.currentIndex).explanation) {
        to = "EXPLANATION";
      } else if (ctx.meta.state === "REVEAL" || ctx.meta.state === "EXPLANATION") {
        to = ctx.snapshot.settings.showLeaderboardAfterEach ? "LEADERBOARD" : this.stateOfNextItem(ctx);
      } else if (ctx.meta.state === "LEADERBOARD" || ctx.meta.state === "PAGE") {
        to = this.stateOfNextItem(ctx);
      } else {
        throw new AppError("INVALID_TRANSITION");
      }
      await this.transition(ctx, to);
    });
  }

  /** `host:end_question`: QUESTION → REVEAL. */
  endQuestion(pin: string): Promise<void> {
    return this.locked(pin, (ctx) => this.transition(ctx, "REVEAL"));
  }

  /** `host:end`: any running state → FINISHED (uses the `* → FINISHED` edges of the state machine). */
  end(pin: string): Promise<void> {
    return this.locked(pin, (ctx) => this.transition(ctx, "FINISHED"));
  }

  /**
   * `host:override`: manual accept / reject of one normalized text answer.
   * Recomputes every affected player, the scores and the leaderboard and
   * re-sends `player:result` to the affected players.
   */
  override(pin: string, payload: HostOverridePayload): Promise<void> {
    return this.locked(pin, async (ctx) => {
      const { meta } = ctx;
      const idx = payload.questionIndex;
      if (meta.state === "LOBBY" || meta.state === "FINISHED") throw new AppError("INVALID");
      const scored = idx < meta.currentIndex || (idx === meta.currentIndex && meta.state !== "QUESTION");
      if (!scored) throw new AppError("INVALID");
      const question = ctx.snapshot.questions[idx];
      if (!question || (question.type !== "text" && question.type !== "music")) throw new AppError("INVALID");
      if (!question.data.fields.some((f) => f.key === payload.fieldKey)) throw new AppError("INVALID");
      if (payload.normalized === "") throw new AppError("INVALID");

      const [players, answers, previous, storedOverrides] = await Promise.all([
        this.deps.store.getPlayers(pin),
        this.deps.store.getAnswers(pin, idx),
        this.deps.store.getResults(pin, idx),
        this.deps.store.getOverrides(pin),
      ]);
      const current = onlyPlayers(answers, players);
      const answeredMs = (id: string): number => previous.get(id)?.answeredMs ?? 0;
      // The key must be one of the reveal groups actually present for this field
      // (`normalize` is not idempotent, so re-normalizing the key is no check).
      const before = this.score(ctx, question, idx, current, storedOverrides, answeredMs);
      if (![...before.values()].some((s) => s.normalized[payload.fieldKey] === payload.normalized)) {
        throw new AppError("INVALID");
      }

      const key = overrideKey(idx, payload.fieldKey, payload.normalized);
      await this.deps.store.setOverride(pin, key, payload.accept);
      const overrides = new Map(storedOverrides).set(key, payload.accept);
      const results = this.score(ctx, question, idx, current, overrides, answeredMs);
      await this.deps.store.setResults(pin, idx, resultsOf(results));
      const standings = await this.refreshScores(ctx, players);

      const affected = [...results].filter(([, s]) => s.normalized[payload.fieldKey] === payload.normalized);
      for (const [playerId, entry] of affected) {
        const standing = standings.find((s) => s.playerId === playerId);
        if (standing) this.deps.notifier.playerResult(pin, playerId, this.playerResult(question, idx, entry, standing));
      }
      // Only while the reveal is on screen; in LEADERBOARD the host gets `leaderboard` only (in EXPLANATION nothing).
      if (idx === meta.currentIndex && meta.state === "REVEAL") {
        this.deps.notifier.questionReveal(pin, buildReveal(question, idx, results, overrides));
      }
      if (meta.state === "LEADERBOARD") {
        this.deps.notifier.leaderboard(pin, this.leaderboardOf(ctx, standings));
      }
      this.deps.log.info(
        { pin, gameId: meta.gameId, questionIndex: idx, fieldKey: payload.fieldKey, accept: payload.accept, affected: affected.length },
        "host override",
      );
      await this.persistProgress(ctx, idx, standings, current, results);
    });
  }

  /** `host:kick`: removes a player from the game. */
  kick(pin: string, playerId: string): Promise<void> {
    return this.locked(pin, async (ctx) => {
      if (ctx.meta.state === "FINISHED") throw new AppError("INVALID");
      const player = await this.deps.store.getPlayer(pin, playerId);
      if (!player) throw new AppError("INVALID");
      await this.deps.store.removePlayer(pin, playerId);
      await this.deps.store.removeNick(pin, nicknameKey(player.nickname));
      await this.deps.store.removeScore(pin, playerId);
      this.deps.notifier.playerKicked(pin, playerId);
      this.deps.log.info({ pin, gameId: ctx.meta.gameId, playerId }, "player kicked");
      await this.afterPlayersChanged(ctx);
    });
  }

  // -------------------------------------------------------------------------
  // Player intents
  // -------------------------------------------------------------------------

  /** `player:join`: new player with a unique nickname and an avatar; late join is allowed. */
  join(pin: string, nickname: string, avatar: Avatar = DEFAULT_AVATAR): Promise<{ playerId: string; token: string }> {
    return this.mutex.run(pin, async () => {
      const meta = await this.deps.store.getMeta(pin);
      if (meta?.state === "FINISHED") throw new AppError("GAME_FINISHED");
      if (!meta || (await this.deps.store.getPinGameId(pin)) === null) throw new AppError("PIN_NOT_FOUND");
      const ctx = await this.loadContext(pin);

      const nick = nickname.trim();
      const key = nicknameKey(nick);
      if (key === "") throw new AppError("INVALID");
      if (!(await this.deps.store.addNick(pin, key))) throw new AppError("NICK_TAKEN");

      const playerId = this.newId();
      const token = `${playerId}.${randomBytes(24).toString("base64url")}`;
      await this.deps.store.setPlayer(pin, playerId, {
        nickname: nick,
        avatar,
        tokenHash: hashToken(token),
        connected: true,
        joinedAt: this.now(),
      });
      await this.deps.store.setScores(pin, new Map([[playerId, 0]]));
      this.deps.log.info({ pin, gameId: meta.gameId, playerId }, "player joined");
      await this.afterPlayersChanged(ctx);
      return { playerId, token };
    });
  }

  /**
   * `player:rejoin`: validates the token, marks the player connected, returns the snapshot.
   * `boundPlayerId` = player the calling socket is already bound to; rejoining as
   * somebody else on the same socket is rejected before any state changes.
   */
  rejoin(pin: string, token: string, boundPlayerId?: string): Promise<PlayerGameState> {
    return this.locked(pin, async (ctx) => {
      const playerId = playerIdFromToken(token);
      const player = playerId === null ? null : await this.deps.store.getPlayer(pin, playerId);
      if (playerId === null || !player || !tokenMatches(token, player.tokenHash)) {
        throw new AppError("INVALID_TOKEN");
      }
      if (boundPlayerId !== undefined && boundPlayerId !== playerId) throw new AppError("INVALID");
      if (!player.connected) {
        await this.deps.store.setPlayer(pin, playerId, { ...player, connected: true });
        await this.afterPlayersChanged(ctx);
      }
      return this.playerState(ctx, playerId);
    });
  }

  /**
   * Audio clip of the running question (or of its explanation) for a player
   * who plays sound on their own device. Only with a valid player token, only
   * in `QUESTION` / `EXPLANATION` and only for the current question with audio
   * – the clip never leaves the server earlier than the host screen plays it.
   * Read only, no lock needed.
   */
  async playerClip(pin: string, token: string, index: number): Promise<{ audioId: string; clip: Clip }> {
    const ctx = await this.tryLoadContext(pin);
    if (!ctx) throw new AppError("PIN_NOT_FOUND");
    const playerId = playerIdFromToken(token);
    const player = playerId === null ? null : await this.deps.store.getPlayer(pin, playerId);
    if (!player || !tokenMatches(token, player.tokenHash)) throw new AppError("INVALID_TOKEN");
    const { meta } = ctx;
    if ((meta.state !== "QUESTION" && meta.state !== "EXPLANATION") || meta.currentIndex !== index) {
      throw new AppError("NOT_FOUND");
    }
    const question = this.questionAt(ctx, index);
    let audioId: string | undefined;
    let clip: Clip | undefined;
    if (meta.state === "EXPLANATION") {
      audioId = question.explanation?.media?.audioId;
      clip = question.explanation?.clip;
    } else {
      audioId = question.media?.audioId;
      clip = question.type === "music" || question.type === "text" ? question.data.clip : undefined;
    }
    if (audioId === undefined || clip === undefined) throw new AppError("NOT_FOUND");
    return { audioId, clip: { start: clip.start, duration: clip.duration } };
  }

  /** Complete player snapshot (`game:state`). */
  getPlayerState(pin: string, playerId: string): Promise<PlayerGameState> {
    return this.locked(pin, (ctx) => this.playerState(ctx, playerId));
  }

  /** Socket connect / disconnect of a player. */
  setConnected(pin: string, playerId: string, connected: boolean): Promise<void> {
    return this.mutex.run(pin, async () => {
      const ctx = await this.tryLoadContext(pin);
      if (!ctx) return;
      const player = await this.deps.store.getPlayer(pin, playerId);
      if (!player || player.connected === connected) return;
      await this.deps.store.setPlayer(pin, playerId, { ...player, connected });
      await this.afterPlayersChanged(ctx);
    });
  }

  /**
   * `player:answer`. `receivedAt` is the server time the event arrived.
   * Rejected outside QUESTION, for another question index, after
   * `deadline + grace`, for invalid payloads and for a second answer (HSETNX).
   */
  submitAnswer(
    pin: string,
    playerId: string,
    questionIndex: number,
    payload: unknown,
    receivedAt: number,
  ): Promise<PlayerAnswerAck> {
    return this.mutex.run(pin, async (): Promise<PlayerAnswerAck> => {
      const ctx = await this.tryLoadContext(pin);
      if (!ctx || !(await this.deps.store.getPlayer(pin, playerId))) return { error: "INVALID" };
      const { meta } = ctx;
      if (questionIndex < meta.currentIndex) return { error: "LATE" };
      if (questionIndex !== meta.currentIndex) return { error: "INVALID" };
      if (meta.state !== "QUESTION" || receivedAt > meta.deadline + ANSWER_GRACE_MS) return { error: "LATE" };

      const question = this.questionAt(ctx, questionIndex);
      const answer = parseAnswerPayload(question, payload);
      if (!answer) return { error: "INVALID" };
      const added = await this.deps.store.addAnswer(pin, questionIndex, playerId, {
        payload: answer.payload,
        receivedAt,
      });
      if (!added) return { error: "ALREADY_ANSWERED" };

      this.deps.notifier.questionProgress(pin, await this.progress(ctx));
      // Queued behind this task, so the ack goes out before a possible reveal.
      this.mutex.run(pin, () => this.endIfAllAnswered(pin, questionIndex)).catch((err: unknown) => {
        this.deps.log.error({ err, pin, gameId: meta.gameId }, "auto end failed");
      });
      return { ok: true };
    });
  }

  // -------------------------------------------------------------------------
  // State machine
  // -------------------------------------------------------------------------

  /**
   * The only place where the game state changes. Validates `from → to`
   * (invalid transitions throw `INVALID_TRANSITION`) and runs the entry
   * actions of the target state.
   */
  private async transition(ctx: GameContext, to: GameStateName): Promise<void> {
    const from = ctx.meta.state;
    assertTransition(from, to);
    // QUESTION / PAGE enter the next item, which has to exist and be of that kind.
    if (to === "QUESTION" || to === "PAGE") {
      const item = ctx.snapshot.questions[ctx.meta.currentIndex + 1];
      if (!item || isPage(item) !== (to === "PAGE")) throw new AppError("INVALID_TRANSITION");
    }
    // EXPLANATION stays on the revealed question, which has to have one.
    if (to === "EXPLANATION" && !this.questionAt(ctx, ctx.meta.currentIndex).explanation) {
      throw new AppError("INVALID_TRANSITION");
    }
    this.deps.log.info({ pin: ctx.pin, gameId: ctx.meta.gameId, from, to, index: ctx.meta.currentIndex }, "game transition");
    switch (to) {
      case "QUESTION":
        return this.enterQuestion(ctx);
      case "REVEAL":
        return this.enterReveal(ctx);
      case "PAGE":
        return this.enterPage(ctx);
      case "EXPLANATION":
        return this.enterExplanation(ctx);
      case "LEADERBOARD":
        return this.enterLeaderboard(ctx);
      case "FINISHED":
        return this.enterFinished(ctx);
      case "LOBBY":
        throw new AppError("INVALID_TRANSITION");
    }
  }

  private async enterQuestion(ctx: GameContext): Promise<void> {
    const { pin } = ctx;
    const index = ctx.meta.currentIndex + 1;
    const question = this.questionAt(ctx, index);
    const order = presentationOrder(question, ctx.snapshot.settings.shuffleOptions, this.random);
    if (order) await this.deps.store.setShuffle(pin, index, order);

    const startedAt = this.now();
    const deadline = startedAt + question.timeLimit * 1000;
    await this.enterItem(ctx, { state: "QUESTION", currentIndex: index, questionStartedAt: startedAt, deadline });
    this.scheduleDeadline(pin, index, deadline);
    const started = buildQuestionStart({
      question,
      index,
      total: ctx.snapshot.questions.length,
      number: questionNumber(ctx.snapshot.questions, index),
      count: questionCount(ctx.snapshot.questions),
      order,
      deadline,
      serverNow: this.now(),
    });
    this.deps.notifier.questionStart(pin, { host: started, players: forPlayers(started) });
    this.deps.notifier.questionProgress(pin, await this.progress(ctx));
  }

  /** A page has no timer, answers or scoring: the host moves on with `host:next`. */
  private async enterPage(ctx: GameContext): Promise<void> {
    const index = ctx.meta.currentIndex + 1;
    const page = this.pageAt(ctx, index);
    await this.enterItem(ctx, { state: "PAGE", currentIndex: index, questionStartedAt: this.now(), deadline: 0 });
    this.deps.notifier.pageShow(ctx.pin, buildPageShow(page, index));
  }

  /** Common entry of a question / page: updates the meta and marks the game as running on the first item. */
  private async enterItem(
    ctx: GameContext,
    patch: Pick<GameMeta, "state" | "currentIndex" | "questionStartedAt" | "deadline">,
  ): Promise<void> {
    const wasLobby = ctx.meta.status === "lobby";
    await this.updateMeta(ctx, { ...patch, status: "running" });
    if (wasLobby) {
      await this.persist(ctx, "markStarted", () =>
        this.deps.persistence.markStarted(ctx.meta.gameId, new Date(patch.questionStartedAt)),
      );
    }
  }

  private async enterReveal(ctx: GameContext): Promise<void> {
    const { pin } = ctx;
    this.deps.scheduler.cancel(pin);
    const index = ctx.meta.currentIndex;
    const startedAt = ctx.meta.questionStartedAt;
    await this.updateMeta(ctx, { state: "REVEAL" });
    this.deps.notifier.questionEnd(pin, { index });

    const question = this.questionAt(ctx, index);
    const [players, answers, overrides] = await Promise.all([
      this.deps.store.getPlayers(pin),
      this.deps.store.getAnswers(pin, index),
      this.deps.store.getOverrides(pin),
    ]);
    const current = onlyPlayers(answers, players);
    const results = this.score(ctx, question, index, current, overrides, (_, a) => a.receivedAt - startedAt);
    await this.deps.store.setResults(pin, index, resultsOf(results));
    const standings = await this.refreshScores(ctx, players);

    this.deps.notifier.questionReveal(pin, buildReveal(question, index, results, overrides));
    for (const standing of standings) {
      this.deps.notifier.playerResult(
        pin,
        standing.playerId,
        this.playerResult(question, index, results.get(standing.playerId), standing),
      );
    }
    await this.persistProgress(ctx, index, standings, current, results);
  }

  /** Explanation of the revealed question: no timer, no scoring; the host moves on with `host:next`. */
  private async enterExplanation(ctx: GameContext): Promise<void> {
    await this.updateMeta(ctx, { state: "EXPLANATION" });
    const event = this.currentExplanation(ctx);
    if (event) this.deps.notifier.explanationShow(ctx.pin, { host: event, players: explanationForPlayers(event) });
  }

  private async enterLeaderboard(ctx: GameContext): Promise<void> {
    await this.updateMeta(ctx, { state: "LEADERBOARD" });
    const standings = await this.standings(ctx);
    this.deps.notifier.leaderboard(ctx.pin, this.leaderboardOf(ctx, standings));
  }

  private async enterFinished(ctx: GameContext): Promise<void> {
    const { pin } = ctx;
    this.deps.scheduler.cancel(pin);
    await this.updateMeta(ctx, { state: "FINISHED", status: "finished" });
    const standings = await this.refreshScores(ctx, await this.deps.store.getPlayers(pin));
    await this.persist(ctx, "finishGame", () =>
      this.deps.persistence.finishGame(
        ctx.meta.gameId,
        standings.map((s) => ({
          id: s.playerId,
          nickname: s.nickname,
          score: fromHundredths(s.scoreHundredths),
          finalRank: s.rank,
        })),
        new Date(this.now()),
      ),
    );
    await this.deps.store.releasePin(pin);
    this.deps.notifier.gameFinished(pin, buildFinished(standings));
    this.snapshots.delete(ctx.meta.gameId);
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private locked<T>(pin: string, task: (ctx: GameContext) => Promise<T>): Promise<T> {
    return this.mutex.run(pin, async () => task(await this.loadContext(pin)));
  }

  private async loadContext(pin: string): Promise<GameContext> {
    const ctx = await this.tryLoadContext(pin);
    if (!ctx) throw new AppError("PIN_NOT_FOUND");
    return ctx;
  }

  private async tryLoadContext(pin: string): Promise<GameContext | null> {
    const meta = await this.deps.store.getMeta(pin);
    if (!meta) return null;
    let snapshot = this.snapshots.get(meta.gameId);
    if (!snapshot) {
      const stored = await this.deps.store.getSnapshot(pin);
      if (!stored) return null;
      snapshot = stored;
      this.cacheSnapshot(meta.gameId, snapshot);
    }
    return { pin, meta, snapshot };
  }

  private cacheSnapshot(gameId: string, snapshot: QuizSnapshot): void {
    if (this.snapshots.size >= SNAPSHOT_CACHE_MAX) this.snapshots.clear();
    this.snapshots.set(gameId, snapshot);
  }

  private async reservePin(gameId: string): Promise<string> {
    for (let attempt = 0; attempt < PIN_ATTEMPTS; attempt++) {
      const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
      if (await this.deps.store.reservePin(pin, gameId)) return pin;
    }
    throw new AppError("INTERNAL");
  }

  private async updateMeta(ctx: GameContext, patch: Partial<GameMeta>): Promise<void> {
    await this.deps.store.updateMeta(ctx.pin, patch);
    Object.assign(ctx.meta, patch);
  }

  private questionAt(ctx: GameContext, index: number): Question {
    const item = ctx.snapshot.questions[index];
    if (!item || isPage(item)) throw new AppError("INVALID");
    return item;
  }

  private pageAt(ctx: GameContext, index: number): Page {
    const item = ctx.snapshot.questions[index];
    if (!item || !isPage(item)) throw new AppError("INVALID");
    return item;
  }

  /** State entered by the next item: `QUESTION`, `PAGE` or `FINISHED` after the last one. */
  private stateOfNextItem(ctx: GameContext): GameStateName {
    const item = ctx.snapshot.questions[ctx.meta.currentIndex + 1];
    if (!item) return "FINISHED";
    return isPage(item) ? "PAGE" : "QUESTION";
  }

  /** Leaderboard after the current question; its number does not count pages. */
  private leaderboardOf(ctx: GameContext, standings: readonly Standing[]): LeaderboardEvent {
    const { currentIndex } = ctx.meta;
    return buildLeaderboard(currentIndex, questionNumber(ctx.snapshot.questions, currentIndex), standings);
  }

  private scheduleDeadline(pin: string, index: number, deadline: number): void {
    this.deps.scheduler.schedule(pin, deadline + ANSWER_GRACE_MS - this.now(), () => {
      this.onDeadline(pin, index).catch((err: unknown) => {
        this.deps.log.error({ err, pin }, "question deadline handling failed");
      });
    });
  }

  /** Timer callback: ends the question if it is still the running one. */
  private onDeadline(pin: string, index: number): Promise<void> {
    return this.mutex.run(pin, async () => {
      const ctx = await this.tryLoadContext(pin);
      if (ctx?.meta.state === "QUESTION" && ctx.meta.currentIndex === index) {
        await this.transition(ctx, "REVEAL");
      }
    });
  }

  /** Ends the question when every connected player has answered. */
  private async endIfAllAnswered(pin: string, index: number): Promise<void> {
    const ctx = await this.tryLoadContext(pin);
    if (ctx?.meta.state !== "QUESTION" || ctx.meta.currentIndex !== index) return;
    const [players, answers] = await Promise.all([
      this.deps.store.getPlayers(pin),
      this.deps.store.getAnswers(pin, index),
    ]);
    const connected = [...players].filter(([, p]) => p.connected).map(([id]) => id);
    if (connected.length > 0 && connected.every((id) => answers.has(id))) {
      await this.transition(ctx, "REVEAL");
    }
  }

  /** Player list changed (join, kick, connect, disconnect). */
  private async afterPlayersChanged(ctx: GameContext): Promise<void> {
    const players = await this.deps.store.getPlayers(ctx.pin);
    this.deps.notifier.lobbyPlayers(ctx.pin, { players: lobbyList(players) });
    if (ctx.meta.state === "QUESTION") {
      this.deps.notifier.questionProgress(ctx.pin, await this.progress(ctx));
      const index = ctx.meta.currentIndex;
      this.mutex.run(ctx.pin, () => this.endIfAllAnswered(ctx.pin, index)).catch((err: unknown) => {
        this.deps.log.error({ err, pin: ctx.pin, gameId: ctx.meta.gameId }, "auto end failed");
      });
    }
  }

  /** `answered` = answers of current players, `total` = connected players plus those who answered. */
  private async progress(ctx: GameContext): Promise<QuestionProgressEvent> {
    const [players, answers] = await Promise.all([
      this.deps.store.getPlayers(ctx.pin),
      this.deps.store.getAnswers(ctx.pin, ctx.meta.currentIndex),
    ]);
    let answered = 0;
    let total = 0;
    for (const [id, p] of players) {
      const has = answers.has(id);
      if (has) answered++;
      if (has || p.connected) total++;
    }
    return { answered, total };
  }

  private score(
    ctx: GameContext,
    question: Question,
    index: number,
    answers: ReadonlyMap<string, AnswerRecord>,
    overrides: ReadonlyMap<string, boolean>,
    answeredMs: (playerId: string, answer: AnswerRecord) => number,
  ): Map<string, ScoredAnswer> {
    return scoreQuestion({
      question,
      questionIndex: index,
      answers,
      answeredMs,
      speedBonus: ctx.snapshot.settings.speedBonus,
      imageAspect: imageAspectOf(question, ctx.snapshot),
      overrides,
    });
  }

  /** Index of the last question that has results. */
  private lastScoredIndex(meta: GameMeta): number {
    if (meta.state === "LOBBY") return -1;
    return meta.state === "QUESTION" ? meta.currentIndex - 1 : meta.currentIndex;
  }

  private async standings(ctx: GameContext, players?: ReadonlyMap<string, PlayerRecord>): Promise<Standing[]> {
    const [list, results] = await Promise.all([
      players ? Promise.resolve(players) : this.deps.store.getPlayers(ctx.pin),
      this.deps.store.getResultsUpTo(ctx.pin, this.lastScoredIndex(ctx.meta)),
    ]);
    return computeStandings(list, results);
  }

  /** Recomputes totals from all results and writes them to `game:{pin}:scores`. */
  private async refreshScores(ctx: GameContext, players: ReadonlyMap<string, PlayerRecord>): Promise<Standing[]> {
    const standings = await this.standings(ctx, players);
    await this.deps.store.setScores(
      ctx.pin,
      new Map(standings.map((s) => [s.playerId, fromHundredths(s.scoreHundredths)])),
    );
    return standings;
  }

  private playerResult(
    question: Question,
    index: number,
    entry: ScoredAnswer | undefined,
    standing: Standing,
  ): PlayerResultEvent {
    const event: PlayerResultEvent = {
      index,
      correctness: entry?.result.correctness ?? 0,
      points: entry?.result.points ?? 0,
      totalScore: fromHundredths(standing.scoreHundredths),
      rank: standing.rank,
      correct: buildCorrectAnswer(question),
      yourAnswer: entry?.answer ?? null,
    };
    if (question.type === "text" || question.type === "music") {
      event.perField =
        entry?.result.perField ?? Object.fromEntries(question.data.fields.map((f) => [f.key, false]));
    }
    return playerResultEventSchema.parse(event);
  }

  /** Current question as sent in `question:start` (sanitized), or null. */
  private async currentQuestion(ctx: GameContext): Promise<QuestionStartEvent | null> {
    const { meta } = ctx;
    if (meta.currentIndex < 0 || meta.state === "LOBBY" || meta.state === "FINISHED" || meta.state === "PAGE") {
      return null;
    }
    const question = this.questionAt(ctx, meta.currentIndex);
    return buildQuestionStart({
      question,
      index: meta.currentIndex,
      total: ctx.snapshot.questions.length,
      number: questionNumber(ctx.snapshot.questions, meta.currentIndex),
      count: questionCount(ctx.snapshot.questions),
      order: await this.deps.store.getShuffle(ctx.pin, meta.currentIndex),
      deadline: meta.deadline,
      serverNow: this.now(),
    });
  }

  /** Current page as sent in `page:show`, or null outside the `PAGE` state. */
  private currentPage(ctx: GameContext): PageShowEvent | null {
    const { meta } = ctx;
    return meta.state === "PAGE" ? buildPageShow(this.pageAt(ctx, meta.currentIndex), meta.currentIndex) : null;
  }

  /** Explanation on screen as sent in `explanation:show` (host variant), or null outside the `EXPLANATION` state. */
  private currentExplanation(ctx: GameContext): ExplanationShowEvent | null {
    const { meta } = ctx;
    if (meta.state !== "EXPLANATION") return null;
    const question = this.questionAt(ctx, meta.currentIndex);
    return buildExplanationShow(question, meta.currentIndex, questionNumber(ctx.snapshot.questions, meta.currentIndex));
  }

  /** Scores of the current question recomputed from stored answers + results (deterministic). */
  private async scoredCurrent(ctx: GameContext, players: ReadonlyMap<string, PlayerRecord>): Promise<{
    question: Question;
    results: Map<string, ScoredAnswer>;
    overrides: Map<string, boolean>;
  }> {
    const index = ctx.meta.currentIndex;
    const question = this.questionAt(ctx, index);
    const [answers, stored, overrides] = await Promise.all([
      this.deps.store.getAnswers(ctx.pin, index),
      this.deps.store.getResults(ctx.pin, index),
      this.deps.store.getOverrides(ctx.pin),
    ]);
    const results = this.score(
      ctx,
      question,
      index,
      onlyPlayers(answers, players),
      overrides,
      (id, a) => stored.get(id)?.answeredMs ?? a.receivedAt - ctx.meta.questionStartedAt,
    );
    return { question, results, overrides };
  }

  private async hostState(ctx: GameContext): Promise<HostGameState> {
    const { meta, snapshot } = ctx;
    const players = await this.deps.store.getPlayers(ctx.pin);
    const standings = await this.standings(ctx, players);
    let reveal: QuestionRevealEvent | null = null;
    if (meta.state === "REVEAL") {
      const { question, results, overrides } = await this.scoredCurrent(ctx, players);
      reveal = buildReveal(question, meta.currentIndex, results, overrides);
    }
    return hostGameStateSchema.parse({
      role: "host",
      pin: ctx.pin,
      gameId: meta.gameId,
      quizTitle: snapshot.title,
      settings: snapshot.settings,
      state: meta.state,
      currentIndex: meta.currentIndex,
      total: snapshot.questions.length,
      serverNow: this.now(),
      players: lobbyList(players),
      question: await this.currentQuestion(ctx),
      page: this.currentPage(ctx),
      explanation: this.currentExplanation(ctx),
      progress: meta.state === "QUESTION" ? await this.progress(ctx) : null,
      reveal,
      leaderboard: meta.state === "LEADERBOARD" ? this.leaderboardOf(ctx, standings) : null,
      finished: meta.state === "FINISHED" ? buildFinished(standings) : null,
    } satisfies HostGameState);
  }

  private async playerState(ctx: GameContext, playerId: string): Promise<PlayerGameState> {
    const { meta, snapshot } = ctx;
    const players = await this.deps.store.getPlayers(ctx.pin);
    const player = players.get(playerId);
    if (!player) throw new AppError("INVALID_TOKEN");
    const standings = await this.standings(ctx, players);
    const standing = standings.find((s) => s.playerId === playerId);
    if (!standing) throw new AppError("INVALID_TOKEN");

    const answers = meta.currentIndex >= 0 ? await this.deps.store.getAnswers(ctx.pin, meta.currentIndex) : new Map();
    let result: PlayerResultEvent | null = null;
    if (meta.state === "REVEAL" || meta.state === "EXPLANATION" || meta.state === "LEADERBOARD") {
      const { question, results } = await this.scoredCurrent(ctx, players);
      result = this.playerResult(question, meta.currentIndex, results.get(playerId), standing);
    }
    return playerGameStateSchema.parse({
      role: "player",
      pin: ctx.pin,
      playerId,
      nickname: player.nickname,
      avatar: player.avatar,
      state: meta.state,
      currentIndex: meta.currentIndex,
      total: snapshot.questions.length,
      serverNow: this.now(),
      question: forPlayers(await this.currentQuestion(ctx)),
      page: this.currentPage(ctx),
      explanation: explanationForPlayers(this.currentExplanation(ctx)),
      leaderboard: meta.state === "LEADERBOARD" ? this.leaderboardOf(ctx, standings) : null,
      finished: meta.state === "FINISHED" ? buildFinished(standings) : null,
      score: fromHundredths(standing.scoreHundredths),
      rank: meta.state === "LOBBY" ? null : standing.rank,
      hasAnswered: answers.has(playerId),
      result,
    } satisfies PlayerGameState);
  }

  private async persistProgress(
    ctx: GameContext,
    index: number,
    standings: readonly Standing[],
    answers: ReadonlyMap<string, AnswerRecord>,
    results: ReadonlyMap<string, ScoredAnswer>,
  ): Promise<void> {
    const players = standings.map((s) => ({
      id: s.playerId,
      nickname: s.nickname,
      score: fromHundredths(s.scoreHundredths),
    }));
    const persisted: PersistedAnswer[] = [...results].flatMap(([playerId, entry]) => {
      const answer = answers.get(playerId);
      if (!answer) return [];
      return [
        {
          questionIndex: index,
          playerId,
          payload: answer.payload,
          correctness: entry.result.correctness,
          points: entry.result.points,
          answeredMs: entry.result.answeredMs,
        },
      ];
    });
    await this.persist(ctx, "saveProgress", () => this.deps.persistence.saveProgress(ctx.meta.gameId, players, persisted));
  }

  /** Postgres failures are logged and never break the running game (Redis is the source of truth). */
  private async persist(ctx: GameContext, op: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.deps.log.error({ err, pin: ctx.pin, gameId: ctx.meta.gameId, op }, "game persistence failed");
    }
  }
}

function resultsOf(scored: ReadonlyMap<string, ScoredAnswer>): Map<string, ResultRecord> {
  return new Map([...scored].map(([id, s]) => [id, s.result]));
}
