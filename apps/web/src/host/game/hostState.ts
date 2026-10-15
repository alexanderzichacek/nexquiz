import type {
  ExplanationShowEvent,
  GameFinishedEvent,
  HostGameState,
  LeaderboardEvent,
  LobbyPlayersEvent,
  PageShowEvent,
  QuestionEndEvent,
  QuestionProgressEvent,
  QuestionRevealEvent,
  QuestionStartEvent,
} from "@nexquiz/shared";
import { clockOffset } from "@/lib/serverClock";

/**
 * What the host game screen shows, derived from the `host:attach` snapshot
 * and the live events. Pure functions – every event returns a new object.
 */
export type HostView = Omit<HostGameState, "serverNow" | "role"> & {
  /** `serverNow − Date.now()` at the last sync. */
  clockOffset: number;
};

export function fromHostState(s: HostGameState, localNow: number = Date.now()): HostView {
  const { serverNow, role: _role, ...rest } = s;
  return { ...rest, clockOffset: clockOffset(serverNow, localNow) };
}

export function onLobbyPlayers(v: HostView, e: LobbyPlayersEvent): HostView {
  return { ...v, players: e.players };
}

export function onQuestionStart(v: HostView, e: QuestionStartEvent, localNow: number = Date.now()): HostView {
  return {
    ...v,
    state: "QUESTION",
    currentIndex: e.index,
    total: e.total,
    question: e,
    page: null,
    explanation: null,
    progress: null,
    reveal: null,
    leaderboard: null,
    clockOffset: clockOffset(e.serverNow, localNow),
  };
}

/** `page:show` – a page between questions (no timer, no answers). */
export function onPageShow(v: HostView, e: PageShowEvent): HostView {
  return {
    ...v,
    state: "PAGE",
    currentIndex: e.index,
    question: null,
    page: e,
    explanation: null,
    progress: null,
    reveal: null,
    leaderboard: null,
  };
}

/** `explanation:show` – the explanation of the revealed question (no timer, no answers). */
export function onExplanationShow(v: HostView, e: ExplanationShowEvent): HostView {
  return { ...v, state: "EXPLANATION", currentIndex: e.index, explanation: e, reveal: null, leaderboard: null };
}

export function onProgress(v: HostView, e: QuestionProgressEvent): HostView {
  return v.state === "QUESTION" ? { ...v, progress: e } : v;
}

export function onQuestionEnd(v: HostView, e: QuestionEndEvent): HostView {
  if (v.state !== "QUESTION" || e.index !== v.currentIndex) return v;
  return { ...v, state: "REVEAL", reveal: null };
}

/** `question:reveal` – also re-sent after an override while the reveal is on screen. */
export function onReveal(v: HostView, e: QuestionRevealEvent): HostView {
  if (e.index !== v.currentIndex || (v.state !== "REVEAL" && v.state !== "QUESTION")) return v;
  return { ...v, state: "REVEAL", reveal: e };
}

export function onLeaderboard(v: HostView, e: LeaderboardEvent): HostView {
  return { ...v, state: "LEADERBOARD", leaderboard: e };
}

export function onFinished(v: HostView, e: GameFinishedEvent): HostView {
  return {
    ...v,
    state: "FINISHED",
    question: null,
    page: null,
    explanation: null,
    progress: null,
    reveal: null,
    leaderboard: null,
    finished: e,
  };
}

/** Players currently connected (used for the lobby count and the start button). */
export function connectedCount(v: HostView): number {
  return v.players.filter((p) => p.connected).length;
}
