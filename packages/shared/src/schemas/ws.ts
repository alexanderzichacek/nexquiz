import { z } from "zod";
import {
  errorResponseSchema,
  gameStateNameSchema,
  idSchema,
  localIdSchema,
  nicknameSchema,
  okAckSchema,
  pinSchema,
  playerTokenSchema,
  type ErrorResponse,
  type OkOrErrorAck,
} from "./common.js";
import { taggedAnswerSchema } from "./answer.js";
import {
  clipSchema,
  hotspotTargetSchema,
  LIMITS,
  mediaRefSchema,
  optionSchema,
  quizSettingsSchema,
} from "./question.js";

/** Socket.IO namespaces. */
export const WS_NAMESPACES = { host: "/host", play: "/play" } as const;

/** Event names (single source for both server and clients). */
export const WS_EVENTS = {
  // host → server
  hostAttach: "host:attach",
  hostStart: "host:start",
  hostNext: "host:next",
  hostEndQuestion: "host:end_question",
  hostOverride: "host:override",
  hostKick: "host:kick",
  hostEnd: "host:end",
  // player → server
  playerJoin: "player:join",
  playerRejoin: "player:rejoin",
  playerAnswer: "player:answer",
  // server → clients
  lobbyPlayers: "lobby:players",
  questionStart: "question:start",
  questionProgress: "question:progress",
  questionEnd: "question:end",
  questionReveal: "question:reveal",
  playerResult: "player:result",
  leaderboard: "leaderboard",
  gameFinished: "game:finished",
  gameState: "game:state",
  playerKicked: "player:kicked",
} as const;

const indexSchema = z.number().int().min(0);
const epochMsSchema = z.number().int().nonnegative();
/** Score / points value, already rounded to 2 decimals. */
const scoreSchema = z.number();
/** Correctness in [0, 1], rounded to 3 decimals for transport. */
const correctnessSchema = z.number().min(0).max(1);

// ---------------------------------------------------------------------------
// Handshake
// ---------------------------------------------------------------------------

/** `/play` handshake: `auth: { pin, token? }`. */
export const playHandshakeAuthSchema = z.object({
  pin: pinSchema,
  token: playerTokenSchema.optional(),
});
export type PlayHandshakeAuth = z.infer<typeof playHandshakeAuthSchema>;

// ---------------------------------------------------------------------------
// Host → server
// ---------------------------------------------------------------------------

export const hostAttachPayloadSchema = z.object({ pin: pinSchema });
export type HostAttachPayload = z.infer<typeof hostAttachPayloadSchema>;

export const hostOverridePayloadSchema = z.object({
  questionIndex: indexSchema,
  fieldKey: z.enum(["answer", "artist", "title"]),
  normalized: z.string().max(LIMITS.textAnswer.max * 2),
  accept: z.boolean(),
});
export type HostOverridePayload = z.infer<typeof hostOverridePayloadSchema>;

export const hostKickPayloadSchema = z.object({ playerId: idSchema });
export type HostKickPayload = z.infer<typeof hostKickPayloadSchema>;

// ---------------------------------------------------------------------------
// Player → server
// ---------------------------------------------------------------------------

export const playerJoinPayloadSchema = z.object({
  pin: pinSchema,
  nickname: nicknameSchema,
});
export type PlayerJoinPayload = z.infer<typeof playerJoinPayloadSchema>;

export const playerJoinAckSchema = z.union([
  z.object({ playerId: idSchema, token: playerTokenSchema }),
  errorResponseSchema,
]);
export type PlayerJoinAck = z.infer<typeof playerJoinAckSchema>;

export const playerRejoinPayloadSchema = z.object({
  pin: pinSchema,
  token: playerTokenSchema,
});
export type PlayerRejoinPayload = z.infer<typeof playerRejoinPayloadSchema>;

/** Envelope only – `payload` is validated per question via `parseAnswerPayload`. */
export const playerAnswerPayloadSchema = z.object({
  questionIndex: indexSchema,
  payload: z.unknown(),
});
export type PlayerAnswerPayload = z.infer<typeof playerAnswerPayloadSchema>;

export const PLAYER_ANSWER_ERRORS = ["LATE", "ALREADY_ANSWERED", "INVALID"] as const;
export const playerAnswerAckSchema = z.union([
  okAckSchema,
  z.object({ error: z.enum(PLAYER_ANSWER_ERRORS) }),
]);
export type PlayerAnswerAck = z.infer<typeof playerAnswerAckSchema>;

// ---------------------------------------------------------------------------
// Server → clients
// ---------------------------------------------------------------------------

export const lobbyPlayerSchema = z.object({
  id: idSchema,
  nickname: z.string(),
  connected: z.boolean(),
});
export type LobbyPlayer = z.infer<typeof lobbyPlayerSchema>;

export const lobbyPlayersEventSchema = z.object({ players: z.array(lobbyPlayerSchema) });
export type LobbyPlayersEvent = z.infer<typeof lobbyPlayersEventSchema>;

/** Public part of a field: never contains `accepted`. */
export const publicFieldSchema = z.object({
  key: z.enum(["answer", "artist", "title"]),
  label: z.string().optional(),
  weight: z.number(),
});
export type PublicField = z.infer<typeof publicFieldSchema>;

const questionStartBase = {
  index: indexSchema,
  total: z.number().int().positive(),
  prompt: z.string(),
  media: mediaRefSchema,
  timeLimit: z.number().int(),
  deadline: epochMsSchema,
  serverNow: epochMsSchema,
};

/**
 * `question:start` – explicit whitelist per type. It NEVER contains
 * `correctId`, `correctIds`, the correct item order, `targets` or `accepted`.
 * Parsing a server-built object with this schema strips any unknown keys.
 */
export const questionStartEventSchema = z.discriminatedUnion("type", [
  z.object({ ...questionStartBase, type: z.literal("single"), options: z.array(optionSchema) }),
  z.object({ ...questionStartBase, type: z.literal("multi"), options: z.array(optionSchema) }),
  /** `items` are shuffled (guaranteed not in the correct order). */
  z.object({ ...questionStartBase, type: z.literal("order"), items: z.array(optionSchema) }),
  z.object({ ...questionStartBase, type: z.literal("hotspot") }),
  z.object({ ...questionStartBase, type: z.literal("text"), fields: z.array(publicFieldSchema) }),
  z.object({
    ...questionStartBase,
    type: z.literal("music"),
    fields: z.array(publicFieldSchema),
    /** Needed by the host screen to play the clip; not a secret. */
    clip: clipSchema,
  }),
]);
export type QuestionStartEvent = z.infer<typeof questionStartEventSchema>;

export const questionProgressEventSchema = z.object({
  answered: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
});
export type QuestionProgressEvent = z.infer<typeof questionProgressEventSchema>;

export const questionEndEventSchema = z.object({ index: indexSchema });
export type QuestionEndEvent = z.infer<typeof questionEndEventSchema>;

/** Correct answer, revealed only after the question ends. */
export const correctAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single"), correctId: localIdSchema }),
  z.object({ type: z.literal("multi"), correctIds: z.array(localIdSchema) }),
  z.object({ type: z.literal("order"), items: z.array(optionSchema) }),
  z.object({ type: z.literal("hotspot"), targets: z.array(hotspotTargetSchema) }),
  z.object({
    type: z.literal("text"),
    fields: z.array(z.object({ key: z.literal("answer"), label: z.string().optional(), accepted: z.array(z.string()) })),
  }),
  z.object({
    type: z.literal("music"),
    fields: z.array(
      z.object({ key: z.enum(["artist", "title"]), label: z.string().optional(), accepted: z.array(z.string()) }),
    ),
  }),
]);
export type CorrectAnswer = z.infer<typeof correctAnswerSchema>;

export const voteCountSchema = z.object({ optionId: localIdSchema, count: z.number().int().nonnegative() });
export type VoteCount = z.infer<typeof voteCountSchema>;

export const hotspotTapSchema = z.object({ x: z.number(), y: z.number(), hit: z.boolean() });
export type HotspotTap = z.infer<typeof hotspotTapSchema>;

/** Unique text answers grouped by normalized form (host reveal). */
export const answerGroupSchema = z.object({
  normalized: z.string(),
  examples: z.array(z.string()),
  count: z.number().int().nonnegative(),
  accepted: z.boolean(),
  /** True when the host changed the automatic decision (✋ icon). */
  overridden: z.boolean(),
});
export type AnswerGroup = z.infer<typeof answerGroupSchema>;

export const fieldGroupsSchema = z.object({
  key: z.enum(["answer", "artist", "title"]),
  groups: z.array(answerGroupSchema),
});
export type FieldGroups = z.infer<typeof fieldGroupsSchema>;

export const revealStatsSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single"), votes: z.array(voteCountSchema) }),
  z.object({ type: z.literal("multi"), votes: z.array(voteCountSchema) }),
  z.object({ type: z.literal("order"), averageCorrectness: correctnessSchema }),
  z.object({ type: z.literal("hotspot"), taps: z.array(hotspotTapSchema) }),
  z.object({ type: z.literal("text"), fields: z.array(fieldGroupsSchema) }),
  z.object({ type: z.literal("music"), fields: z.array(fieldGroupsSchema) }),
]);
export type RevealStats = z.infer<typeof revealStatsSchema>;

/** `question:reveal` (host only). */
export const questionRevealEventSchema = z.object({
  index: indexSchema,
  correct: correctAnswerSchema,
  stats: revealStatsSchema,
});
export type QuestionRevealEvent = z.infer<typeof questionRevealEventSchema>;

/** `player:result` (private to one player; re-sent after a host override). */
export const playerResultEventSchema = z.object({
  index: indexSchema,
  correctness: correctnessSchema,
  points: scoreSchema,
  totalScore: scoreSchema,
  rank: z.number().int().positive(),
  correct: correctAnswerSchema,
  yourAnswer: taggedAnswerSchema.nullable(),
  /** Per-field match for `text` / `music`. */
  perField: z.record(z.string(), z.boolean()).optional(),
});
export type PlayerResultEvent = z.infer<typeof playerResultEventSchema>;

export const leaderboardEntrySchema = z.object({
  playerId: idSchema,
  nickname: z.string(),
  score: scoreSchema,
  /** Points gained in the last question. */
  delta: scoreSchema,
  rank: z.number().int().positive(),
  /** Positive = moved up (▲), negative = moved down (▼). */
  rankChange: z.number().int(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

export const leaderboardEventSchema = z.object({
  /** Index of the question after which the leaderboard is shown. */
  index: indexSchema,
  top: z.array(leaderboardEntrySchema).max(10),
});
export type LeaderboardEvent = z.infer<typeof leaderboardEventSchema>;

export const rankingEntrySchema = z.object({
  playerId: idSchema,
  nickname: z.string(),
  score: scoreSchema,
  rank: z.number().int().positive(),
});
export type RankingEntry = z.infer<typeof rankingEntrySchema>;

export const gameFinishedEventSchema = z.object({
  podium: z.array(rankingEntrySchema).max(3),
  ranking: z.array(rankingEntrySchema),
});
export type GameFinishedEvent = z.infer<typeof gameFinishedEventSchema>;

const gameStateBase = {
  pin: pinSchema,
  state: gameStateNameSchema,
  /** -1 while in LOBBY. */
  currentIndex: z.number().int().min(-1),
  total: z.number().int().nonnegative(),
  serverNow: epochMsSchema,
  question: questionStartEventSchema.nullable(),
  leaderboard: leaderboardEventSchema.nullable(),
  finished: gameFinishedEventSchema.nullable(),
};

/** Complete snapshot for the host (`host:attach` ack, `game:state`). */
export const hostGameStateSchema = z.object({
  ...gameStateBase,
  role: z.literal("host"),
  gameId: idSchema,
  quizTitle: z.string(),
  settings: quizSettingsSchema,
  players: z.array(lobbyPlayerSchema),
  progress: questionProgressEventSchema.nullable(),
  reveal: questionRevealEventSchema.nullable(),
});
export type HostGameState = z.infer<typeof hostGameStateSchema>;

/** Complete snapshot for a player (`player:rejoin` ack, `game:state`). */
export const playerGameStateSchema = z.object({
  ...gameStateBase,
  role: z.literal("player"),
  playerId: idSchema,
  nickname: z.string(),
  score: scoreSchema,
  rank: z.number().int().positive().nullable(),
  hasAnswered: z.boolean(),
  result: playerResultEventSchema.nullable(),
});
export type PlayerGameState = z.infer<typeof playerGameStateSchema>;

export const gameStateSchema = z.discriminatedUnion("role", [hostGameStateSchema, playerGameStateSchema]);
export type GameState = z.infer<typeof gameStateSchema>;

export type HostAttachAck = HostGameState | ErrorResponse;
export type PlayerRejoinAck = PlayerGameState | ErrorResponse;

// ---------------------------------------------------------------------------
// Socket.IO typed event maps. Incoming payloads MUST still be parsed with the
// schemas above on the server – the types describe the intended contract only.
// ---------------------------------------------------------------------------

type Ack<T> = (response: T) => void;

export interface HostClientToServerEvents {
  "host:attach": (payload: HostAttachPayload, ack: Ack<HostAttachAck>) => void;
  "host:start": (ack: Ack<OkOrErrorAck>) => void;
  "host:next": (ack: Ack<OkOrErrorAck>) => void;
  "host:end_question": (ack: Ack<OkOrErrorAck>) => void;
  "host:override": (payload: HostOverridePayload, ack: Ack<OkOrErrorAck>) => void;
  "host:kick": (payload: HostKickPayload, ack: Ack<OkOrErrorAck>) => void;
  "host:end": (ack: Ack<OkOrErrorAck>) => void;
}

export interface HostServerToClientEvents {
  "lobby:players": (event: LobbyPlayersEvent) => void;
  "question:start": (event: QuestionStartEvent) => void;
  "question:progress": (event: QuestionProgressEvent) => void;
  "question:end": (event: QuestionEndEvent) => void;
  "question:reveal": (event: QuestionRevealEvent) => void;
  leaderboard: (event: LeaderboardEvent) => void;
  "game:finished": (event: GameFinishedEvent) => void;
  "game:state": (event: HostGameState) => void;
}

export interface PlayClientToServerEvents {
  "player:join": (payload: PlayerJoinPayload, ack: Ack<PlayerJoinAck>) => void;
  "player:rejoin": (payload: PlayerRejoinPayload, ack: Ack<PlayerRejoinAck>) => void;
  "player:answer": (payload: PlayerAnswerPayload, ack: Ack<PlayerAnswerAck>) => void;
}

export interface PlayServerToClientEvents {
  "lobby:players": (event: LobbyPlayersEvent) => void;
  "question:start": (event: QuestionStartEvent) => void;
  "question:end": (event: QuestionEndEvent) => void;
  "player:result": (event: PlayerResultEvent) => void;
  leaderboard: (event: LeaderboardEvent) => void;
  "game:finished": (event: GameFinishedEvent) => void;
  "game:state": (event: PlayerGameState) => void;
  "player:kicked": () => void;
}
