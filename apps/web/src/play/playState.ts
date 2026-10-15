import type {
  Avatar,
  ExplanationShowEvent,
  GameFinishedEvent,
  GameStateName,
  LeaderboardEvent,
  PageShowEvent,
  PlayerGameState,
  PlayerResultEvent,
  QuestionEndEvent,
  QuestionStartEvent,
} from "@nexquiz/shared";
import { clockOffset } from "@/lib/serverClock";

/**
 * What the player screen shows, derived from `game:state` and the live
 * events. Pure functions – every event returns a new object.
 */
export interface PlayView {
  pin: string;
  playerId: string;
  nickname: string;
  avatar: Avatar;
  state: GameStateName;
  currentIndex: number;
  total: number;
  question: QuestionStartEvent | null;
  page: PageShowEvent | null;
  explanation: ExplanationShowEvent | null;
  hasAnswered: boolean;
  result: PlayerResultEvent | null;
  score: number;
  rank: number | null;
  leaderboard: LeaderboardEvent | null;
  finished: GameFinishedEvent | null;
  /** `serverNow − Date.now()` at the last sync. */
  clockOffset: number;
}

export function fromPlayerState(s: PlayerGameState, localNow: number = Date.now()): PlayView {
  return {
    pin: s.pin,
    playerId: s.playerId,
    nickname: s.nickname,
    avatar: s.avatar,
    state: s.state,
    currentIndex: s.currentIndex,
    total: s.total,
    question: s.question,
    page: s.page,
    explanation: s.explanation,
    hasAnswered: s.hasAnswered,
    result: s.result,
    score: s.score,
    rank: s.rank,
    leaderboard: s.leaderboard,
    finished: s.finished,
    clockOffset: clockOffset(s.serverNow, localNow),
  };
}

export function onQuestionStart(v: PlayView, e: QuestionStartEvent, localNow: number = Date.now()): PlayView {
  return {
    ...v,
    state: "QUESTION",
    currentIndex: e.index,
    total: e.total,
    question: e,
    page: null,
    explanation: null,
    hasAnswered: false,
    result: null,
    leaderboard: null,
    clockOffset: clockOffset(e.serverNow, localNow),
  };
}

/** `page:show` – a page between questions. */
export function onPageShow(v: PlayView, e: PageShowEvent): PlayView {
  return {
    ...v,
    state: "PAGE",
    currentIndex: e.index,
    question: null,
    page: e,
    explanation: null,
    hasAnswered: false,
    result: null,
    leaderboard: null,
  };
}

/** `explanation:show` – the explanation of the revealed question; the result of the question stays. */
export function onExplanationShow(v: PlayView, e: ExplanationShowEvent): PlayView {
  return { ...v, state: "EXPLANATION", currentIndex: e.index, explanation: e, leaderboard: null };
}

export function onQuestionEnd(v: PlayView, e: QuestionEndEvent): PlayView {
  if (v.state !== "QUESTION" || e.index !== v.currentIndex) return v;
  return { ...v, state: "REVEAL" };
}

/** `player:result` – also re-sent after a host override (possibly for an older question). */
export function onPlayerResult(v: PlayView, e: PlayerResultEvent): PlayView {
  const next: PlayView = { ...v, score: e.totalScore, rank: e.rank };
  if (e.index === v.currentIndex && v.state !== "FINISHED") {
    next.result = e;
    if (v.state === "QUESTION") next.state = "REVEAL";
  }
  return next;
}

export function onLeaderboard(v: PlayView, e: LeaderboardEvent): PlayView {
  const own = e.top.find((t) => t.playerId === v.playerId);
  return {
    ...v,
    state: "LEADERBOARD",
    leaderboard: e,
    ...(own ? { score: own.score, rank: own.rank } : {}),
  };
}

export function onFinished(v: PlayView, e: GameFinishedEvent): PlayView {
  const own = e.ranking.find((r) => r.playerId === v.playerId);
  return {
    ...v,
    state: "FINISHED",
    question: null,
    page: null,
    explanation: null,
    finished: e,
    ...(own ? { score: own.score, rank: own.rank } : {}),
  };
}

/** Optimistic „Odpoveď odoslaná“ (reverted with `answered: false` when the server rejects it). */
export function setAnswered(v: PlayView, index: number, answered: boolean): PlayView {
  if (v.state !== "QUESTION" || v.currentIndex !== index) return v;
  return { ...v, hasAnswered: answered };
}

/** `{rank}. z {total}` for the end screen, or null when the player is not ranked. */
export function finalPlacement(v: PlayView): { rank: number; total: number } | null {
  if (!v.finished) return null;
  const own = v.finished.ranking.find((r) => r.playerId === v.playerId);
  return own ? { rank: own.rank, total: v.finished.ranking.length } : null;
}
