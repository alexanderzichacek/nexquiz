import type { Quiz, QuizSettings, QuizSnapshot } from "@nexquiz/shared";
import type { AppServices } from "../app.js";
import { GameService } from "../game/GameService.js";
import type { GameLogger, GameNotifier, GamePersistence, PersistedAnswer, PersistedPlayer } from "../game/ports.js";
import type { Scheduler } from "../game/scheduler.js";
import { MemoryGameStore } from "../store/memoryGameStore.js";

export const IMAGE_ID = "11111111-1111-4111-8111-111111111111";
export const AUDIO_ID = "22222222-2222-4222-8222-222222222222";
export const QUIZ_ID = "33333333-3333-4333-8333-333333333333";

export const Q = {
  single: "aaaaaaaa-0000-4000-8000-000000000001",
  multi: "aaaaaaaa-0000-4000-8000-000000000002",
  order: "aaaaaaaa-0000-4000-8000-000000000003",
  hotspot: "aaaaaaaa-0000-4000-8000-000000000004",
  text: "aaaaaaaa-0000-4000-8000-000000000005",
  music: "aaaaaaaa-0000-4000-8000-000000000006",
} as const;

/** One question of every type (10 s each, 1 point). */
export function sampleQuiz(settings: Partial<QuizSettings> = {}): Quiz {
  return {
    id: QUIZ_ID,
    title: "Test quiz",
    description: null,
    settings: { speedBonus: true, showLeaderboardAfterEach: true, shuffleOptions: false, ...settings },
    questions: [
      {
        id: Q.single,
        type: "single",
        prompt: "2 + 2?",
        timeLimit: 10,
        points: 1,
        data: {
          options: [
            { id: "a", text: "3" },
            { id: "b", text: "4" },
            { id: "c", text: "5" },
          ],
          correctId: "b",
        },
      },
      {
        id: Q.multi,
        type: "multi",
        prompt: "Prime numbers?",
        timeLimit: 10,
        points: 1,
        data: {
          options: [
            { id: "a", text: "2" },
            { id: "b", text: "4" },
            { id: "c", text: "5" },
            { id: "d", text: "9" },
          ],
          correctIds: ["a", "c"],
          scoring: "partial",
        },
      },
      {
        id: Q.order,
        type: "order",
        prompt: "Sort ascending",
        timeLimit: 10,
        points: 1,
        data: {
          items: [
            { id: "i1", text: "1" },
            { id: "i2", text: "2" },
            { id: "i3", text: "3" },
            { id: "i4", text: "4" },
          ],
          scoring: "partial",
        },
      },
      {
        id: Q.hotspot,
        type: "hotspot",
        prompt: "Where is it?",
        media: { imageId: IMAGE_ID },
        timeLimit: 10,
        points: 1,
        data: { targets: [{ shape: "circle", x: 0.5, y: 0.5, r: 0.1 }] },
      },
      {
        id: Q.text,
        type: "text",
        prompt: "Capital of Slovakia?",
        timeLimit: 10,
        points: 1,
        data: {
          fields: [{ key: "answer", weight: 1, accepted: ["Bratislava", "BA"] }],
          tolerance: "normal",
        },
      },
      {
        id: Q.music,
        type: "music",
        prompt: "Name the song",
        media: { audioId: AUDIO_ID },
        timeLimit: 10,
        points: 1,
        data: {
          clip: { start: 10, duration: 20 },
          fields: [
            { key: "artist", label: "Interpret", weight: 0.5, accepted: ["Metallica"] },
            { key: "title", label: "Názov skladby", weight: 0.5, accepted: ["One"] },
          ],
          tolerance: "normal",
        },
      },
    ],
  };
}

export type RecordedEvent =
  | { kind: "lobbyPlayers" | "questionStart" | "questionStartPlayers" | "questionProgress" | "questionEnd" | "questionReveal" | "leaderboard" | "gameFinished"; pin: string; payload: unknown }
  | { kind: "playerResult"; pin: string; playerId: string; payload: unknown }
  | { kind: "playerKicked"; pin: string; playerId: string; payload: null };

/** Records every outgoing realtime message. */
export class RecordingNotifier implements GameNotifier {
  readonly events: RecordedEvent[] = [];

  lobbyPlayers(pin: string, payload: unknown): void {
    this.events.push({ kind: "lobbyPlayers", pin, payload });
  }
  /** Recorded as `questionStart` (host variant) + `questionStartPlayers` (player variant). */
  questionStart(pin: string, payload: { host: unknown; players: unknown }): void {
    this.events.push({ kind: "questionStart", pin, payload: payload.host });
    this.events.push({ kind: "questionStartPlayers", pin, payload: payload.players });
  }
  questionProgress(pin: string, payload: unknown): void {
    this.events.push({ kind: "questionProgress", pin, payload });
  }
  questionEnd(pin: string, payload: unknown): void {
    this.events.push({ kind: "questionEnd", pin, payload });
  }
  questionReveal(pin: string, payload: unknown): void {
    this.events.push({ kind: "questionReveal", pin, payload });
  }
  playerResult(pin: string, playerId: string, payload: unknown): void {
    this.events.push({ kind: "playerResult", pin, playerId, payload });
  }
  leaderboard(pin: string, payload: unknown): void {
    this.events.push({ kind: "leaderboard", pin, payload });
  }
  gameFinished(pin: string, payload: unknown): void {
    this.events.push({ kind: "gameFinished", pin, payload });
  }
  playerKicked(pin: string, playerId: string): void {
    this.events.push({ kind: "playerKicked", pin, playerId, payload: null });
  }

  of(kind: RecordedEvent["kind"]): RecordedEvent[] {
    return this.events.filter((e) => e.kind === kind);
  }

  last(kind: RecordedEvent["kind"]): RecordedEvent | undefined {
    return this.of(kind).at(-1);
  }

  clear(): void {
    this.events.length = 0;
  }
}

/** Timers fired manually by the test. */
export class ManualScheduler implements Scheduler {
  readonly timers = new Map<string, { delayMs: number; fn: () => void }>();

  schedule(key: string, delayMs: number, fn: () => void): void {
    this.timers.set(key, { delayMs, fn });
  }
  cancel(key: string): void {
    this.timers.delete(key);
  }
  cancelAll(): void {
    this.timers.clear();
  }
  fire(key: string): void {
    const timer = this.timers.get(key);
    this.timers.delete(key);
    timer?.fn();
  }
}

export class FakePersistence implements GamePersistence {
  readonly created: { id: string; quizId: string; pin: string; snapshot: QuizSnapshot }[] = [];
  readonly started: string[] = [];
  readonly progress: { gameId: string; players: PersistedPlayer[]; answers: PersistedAnswer[] }[] = [];
  readonly finished: { gameId: string; players: PersistedPlayer[] }[] = [];

  async createGame(game: { id: string; quizId: string; pin: string; snapshot: QuizSnapshot }): Promise<void> {
    this.created.push(game);
  }
  async markStarted(gameId: string): Promise<void> {
    this.started.push(gameId);
  }
  async saveProgress(gameId: string, players: readonly PersistedPlayer[], answers: readonly PersistedAnswer[]): Promise<void> {
    this.progress.push({ gameId, players: [...players], answers: [...answers] });
  }
  async finishGame(gameId: string, players: readonly PersistedPlayer[]): Promise<void> {
    this.finished.push({ gameId, players: [...players] });
  }
}

export const silentLog: GameLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export interface Harness {
  games: GameService;
  store: MemoryGameStore;
  notifier: RecordingNotifier;
  scheduler: ManualScheduler;
  persistence: FakePersistence;
  clock: { t: number };
  quiz: Quiz;
  /** Waits until all queued work of the game (e.g. auto end) is done. */
  settle(pin: string): Promise<void>;
}

export function createHarness(settings: Partial<QuizSettings> = {}, quiz: Quiz = sampleQuiz(settings)): Harness {
  const store = new MemoryGameStore();
  const notifier = new RecordingNotifier();
  const scheduler = new ManualScheduler();
  const persistence = new FakePersistence();
  const clock = { t: 1_700_000_000_000 };
  const games = new GameService({
    store,
    persistence,
    quizzes: {
      loadForSnapshot: async (id) =>
        id === quiz.id ? { quiz: structuredClone(quiz), images: { [IMAGE_ID]: { width: 1000, height: 500 } } } : null,
    },
    notifier,
    scheduler,
    log: silentLog,
    now: () => clock.t,
  });
  const settle = async (pin: string): Promise<void> => {
    // Two rounds: work queued by a task runs after it; a lock round trip waits for it.
    for (let i = 0; i < 3; i++) await games.attachHost(pin).catch(() => undefined);
  };
  return { games, store, notifier, scheduler, persistence, clock, quiz, settle };
}

/** Minimal fake services around a real `GameService` (REST / realtime tests). */
export function fakeAppServices(games: GameService): AppServices {
  return {
    games,
    quizzes: {
      list: async () => [],
      get: async () => null,
      create: async () => {
        throw new Error("not used");
      },
      update: async () => null,
      duplicate: async () => null,
      delete: async () => false,
    },
    media: {
      upload: async () => {
        throw new Error("not used");
      },
      get: async () => null,
      storage: {
        save: async () => undefined,
        size: async () => null,
        read: () => {
          throw new Error("not used");
        },
        remove: async () => undefined,
      },
    },
    history: { history: async () => [], results: async () => null },
  };
}
