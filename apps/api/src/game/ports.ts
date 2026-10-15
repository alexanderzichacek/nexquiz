import type {
  ExplanationShowEvent,
  GameFinishedEvent,
  ImageSize,
  LeaderboardEvent,
  LobbyPlayersEvent,
  PageShowEvent,
  PlayerResultEvent,
  QuestionEndEvent,
  QuestionProgressEvent,
  QuestionRevealEvent,
  QuestionStartEvent,
  Quiz,
  QuizSnapshot,
} from "@nexquiz/shared";

/** Outgoing realtime messages of a game (implemented by the Socket.IO layer). */
export interface GameNotifier {
  /** Host + all players. */
  lobbyPlayers(pin: string, event: LobbyPlayersEvent): void;
  /** Host gets `host`, players get `players` (without `media.audioId`, see `forPlayers`). */
  questionStart(pin: string, event: { host: QuestionStartEvent; players: QuestionStartEvent }): void;
  /** Host + all players. */
  pageShow(pin: string, event: PageShowEvent): void;
  /** Host gets `host`, players get `players` (without `media.audioId`, see `explanationForPlayers`). */
  explanationShow(pin: string, event: { host: ExplanationShowEvent; players: ExplanationShowEvent }): void;
  /** Host only. */
  questionProgress(pin: string, event: QuestionProgressEvent): void;
  /** Host + all players. */
  questionEnd(pin: string, event: QuestionEndEvent): void;
  /** Host only. */
  questionReveal(pin: string, event: QuestionRevealEvent): void;
  /** One player. */
  playerResult(pin: string, playerId: string, event: PlayerResultEvent): void;
  /** Host + all players. */
  leaderboard(pin: string, event: LeaderboardEvent): void;
  /** Host + all players. */
  gameFinished(pin: string, event: GameFinishedEvent): void;
  /** One player; their sockets also leave the game rooms. */
  playerKicked(pin: string, playerId: string): void;
}

export const noopNotifier: GameNotifier = {
  lobbyPlayers: () => undefined,
  questionStart: () => undefined,
  pageShow: () => undefined,
  explanationShow: () => undefined,
  questionProgress: () => undefined,
  questionEnd: () => undefined,
  questionReveal: () => undefined,
  playerResult: () => undefined,
  leaderboard: () => undefined,
  gameFinished: () => undefined,
  playerKicked: () => undefined,
};

export interface PersistedPlayer {
  id: string;
  nickname: string;
  score: number;
  finalRank?: number;
}

export interface PersistedAnswer {
  questionIndex: number;
  playerId: string;
  payload: unknown;
  correctness: number;
  points: number;
  answeredMs: number;
}

/** Durable game history in Postgres (`games`, `game_players`, `game_answers`). */
export interface GamePersistence {
  createGame(game: { id: string; quizId: string; pin: string; snapshot: QuizSnapshot }): Promise<void>;
  markStarted(gameId: string, startedAt: Date): Promise<void>;
  /**
   * After each reveal / override: upserts the players with their running
   * score (removing kicked ones) and the answers of one question.
   */
  saveProgress(gameId: string, players: readonly PersistedPlayer[], answers: readonly PersistedAnswer[]): Promise<void>;
  /** At FINISHED: final scores, `final_rank`, `status = finished`. */
  finishGame(gameId: string, players: readonly PersistedPlayer[], finishedAt: Date): Promise<void>;
}

/** Source of the quiz data a game snapshot is taken from. */
export interface QuizSource {
  loadForSnapshot(quizId: string): Promise<{ quiz: Quiz; images: Record<string, ImageSize> } | null>;
}

/** Minimal structured logger (satisfied by the Fastify / pino logger). */
export interface GameLogger {
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}
