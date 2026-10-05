import type { HostGameState, QuestionStartEvent } from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import {
  connectedCount,
  fromHostState,
  onFinished,
  onLeaderboard,
  onLobbyPlayers,
  onProgress,
  onQuestionEnd,
  onQuestionStart,
  onReveal,
} from "./hostState";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";

function lobby(): HostGameState {
  return {
    role: "host",
    pin: "123456",
    gameId: "33333333-3333-4333-8333-333333333333",
    quizTitle: "Zemepis",
    settings: { speedBonus: true, showLeaderboardAfterEach: true, shuffleOptions: false },
    state: "LOBBY",
    currentIndex: -1,
    total: 2,
    serverNow: 10_000,
    players: [{ id: P1, nickname: "Jano", connected: true }],
    question: null,
    progress: null,
    reveal: null,
    leaderboard: null,
    finished: null,
  };
}

const question: QuestionStartEvent = {
  type: "single",
  index: 0,
  total: 2,
  prompt: "Hlavné mesto Austrálie?",
  media: {},
  options: [
    { id: "a", text: "Sydney" },
    { id: "b", text: "Canberra" },
  ],
  timeLimit: 20,
  deadline: 40_000,
  serverNow: 20_000,
};

describe("hostState", () => {
  it("computes the clock offset from serverNow", () => {
    const v = fromHostState(lobby(), 9_000);
    expect(v.clockOffset).toBe(1_000);
    expect(v.state).toBe("LOBBY");
  });

  it("walks LOBBY → QUESTION → REVEAL → LEADERBOARD → FINISHED", () => {
    let v = fromHostState(lobby(), 10_000);
    v = onLobbyPlayers(v, {
      players: [
        { id: P1, nickname: "Jano", connected: true },
        { id: P2, nickname: "Zuzka", connected: false },
      ],
    });
    expect(connectedCount(v)).toBe(1);

    v = onQuestionStart(v, question, 19_500);
    expect(v.state).toBe("QUESTION");
    expect(v.currentIndex).toBe(0);
    expect(v.clockOffset).toBe(500);

    v = onProgress(v, { answered: 1, total: 2 });
    expect(v.progress).toEqual({ answered: 1, total: 2 });

    v = onQuestionEnd(v, { index: 0 });
    expect(v.state).toBe("REVEAL");
    expect(v.reveal).toBeNull();

    v = onReveal(v, {
      index: 0,
      correct: { type: "single", correctId: "b" },
      stats: { type: "single", votes: [{ optionId: "b", count: 1 }] },
    });
    expect(v.reveal?.correct).toEqual({ type: "single", correctId: "b" });

    v = onLeaderboard(v, { index: 0, top: [] });
    expect(v.state).toBe("LEADERBOARD");

    v = onFinished(v, { podium: [], ranking: [] });
    expect(v.state).toBe("FINISHED");
    expect(v.question).toBeNull();
  });

  it("ignores progress outside QUESTION and stale question:end / reveal", () => {
    let v = fromHostState(lobby());
    expect(onProgress(v, { answered: 1, total: 1 }).progress).toBeNull();
    v = onQuestionStart(v, question);
    expect(onQuestionEnd(v, { index: 3 }).state).toBe("QUESTION");
    const stale = onReveal(v, {
      index: 5,
      correct: { type: "single", correctId: "a" },
      stats: { type: "single", votes: [] },
    });
    expect(stale.reveal).toBeNull();
  });
});
