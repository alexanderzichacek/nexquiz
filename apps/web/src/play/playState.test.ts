import type { PlayerGameState, PlayerResultEvent, QuestionStartEvent } from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import {
  finalPlacement,
  fromPlayerState,
  onFinished,
  onLeaderboard,
  onPlayerResult,
  onQuestionEnd,
  onQuestionStart,
  setAnswered,
} from "./playState";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

function state(): PlayerGameState {
  return {
    role: "player",
    pin: "123456",
    playerId: ME,
    nickname: "Jano",
    state: "LOBBY",
    currentIndex: -1,
    total: 3,
    serverNow: 5_000,
    question: null,
    leaderboard: null,
    finished: null,
    score: 0,
    rank: null,
    hasAnswered: false,
    result: null,
  };
}

const q0: QuestionStartEvent = {
  type: "text",
  index: 0,
  total: 3,
  prompt: "Najvyšší štít Tatier?",
  media: {},
  fields: [{ key: "answer", weight: 1 }],
  timeLimit: 30,
  deadline: 60_000,
  serverNow: 30_000,
};

function result(index: number, points: number, totalScore: number, rank: number): PlayerResultEvent {
  return {
    index,
    correctness: points > 0 ? 1 : 0,
    points,
    totalScore,
    rank,
    correct: { type: "text", fields: [{ key: "answer", accepted: ["Gerlachovský štít"] }] },
    yourAnswer: { type: "text", payload: { answers: { answer: "gerlach" } } },
    perField: { answer: points > 0 },
  };
}

describe("playState", () => {
  it("starts a question with a fresh answer state and the server clock offset", () => {
    let v = fromPlayerState(state(), 4_000);
    expect(v.clockOffset).toBe(1_000);
    v = onQuestionStart(v, q0, 29_000);
    expect(v.state).toBe("QUESTION");
    expect(v.hasAnswered).toBe(false);
    expect(v.clockOffset).toBe(1_000);
  });

  it("sets and reverts the optimistic answered flag only for the current question", () => {
    let v = onQuestionStart(fromPlayerState(state()), q0);
    v = setAnswered(v, 0, true);
    expect(v.hasAnswered).toBe(true);
    expect(setAnswered(v, 1, false).hasAnswered).toBe(true);
    v = setAnswered(v, 0, false);
    expect(v.hasAnswered).toBe(false);
  });

  it("moves to REVEAL on question:end and keeps the result of the current question", () => {
    let v = onQuestionStart(fromPlayerState(state()), q0);
    v = onQuestionEnd(v, { index: 0 });
    expect(v.state).toBe("REVEAL");
    v = onPlayerResult(v, result(0, 0.85, 0.85, 1));
    expect(v.result?.points).toBe(0.85);
    expect(v.score).toBe(0.85);
    expect(v.rank).toBe(1);
  });

  it("an override result for an older question only updates score and rank", () => {
    let v = onQuestionStart(fromPlayerState(state()), q0);
    v = onPlayerResult(onQuestionEnd(v, { index: 0 }), result(0, 0, 0, 2));
    v = onQuestionStart(v, { ...q0, index: 1 });
    v = onPlayerResult(v, result(0, 1, 1, 1));
    expect(v.state).toBe("QUESTION");
    expect(v.result).toBeNull();
    expect(v.score).toBe(1);
    expect(v.rank).toBe(1);
  });

  it("takes score and rank from the leaderboard and the final ranking", () => {
    let v = fromPlayerState(state());
    v = onLeaderboard(v, {
      index: 0,
      top: [{ playerId: ME, nickname: "Jano", score: 2.5, delta: 1, rank: 2, rankChange: 1 }],
    });
    expect(v.state).toBe("LEADERBOARD");
    expect(v.rank).toBe(2);
    v = onFinished(v, {
      podium: [],
      ranking: [
        { playerId: OTHER, nickname: "Zuzka", score: 3, rank: 1 },
        { playerId: ME, nickname: "Jano", score: 2.5, rank: 2 },
      ],
    });
    expect(finalPlacement(v)).toEqual({ rank: 2, total: 2 });
  });
});
