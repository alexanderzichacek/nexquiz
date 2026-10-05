import { describe, expect, it } from "vitest";
import { rankChange, rankPlayers } from "./ranking.js";

describe("rankPlayers", () => {
  it("sorts by score desc", () => {
    const ranked = rankPlayers([
      { playerId: "a", scoreHundredths: 100, correctAnsweredMs: 0 },
      { playerId: "b", scoreHundredths: 300, correctAnsweredMs: 0 },
      { playerId: "c", scoreHundredths: 200, correctAnsweredMs: 0 },
    ]);
    expect(ranked.map((p) => [p.playerId, p.rank])).toEqual([
      ["b", 1],
      ["c", 2],
      ["a", 3],
    ]);
  });

  it("breaks ties by lower sum of answeredMs of correct answers", () => {
    const ranked = rankPlayers([
      { playerId: "slow", scoreHundredths: 200, correctAnsweredMs: 9000 },
      { playerId: "fast", scoreHundredths: 200, correctAnsweredMs: 3000 },
    ]);
    expect(ranked.map((p) => [p.playerId, p.rank])).toEqual([
      ["fast", 1],
      ["slow", 2],
    ]);
  });

  it("gives the same rank to full ties", () => {
    const ranked = rankPlayers([
      { playerId: "a", scoreHundredths: 200, correctAnsweredMs: 1000 },
      { playerId: "b", scoreHundredths: 200, correctAnsweredMs: 1000 },
      { playerId: "c", scoreHundredths: 100, correctAnsweredMs: 1000 },
    ]);
    expect(ranked.map((p) => p.rank)).toEqual([1, 1, 3]);
  });

  it("does not mutate the input", () => {
    const input = [
      { playerId: "a", scoreHundredths: 1, correctAnsweredMs: 0 },
      { playerId: "b", scoreHundredths: 2, correctAnsweredMs: 0 },
    ];
    rankPlayers(input);
    expect(input[0]?.playerId).toBe("a");
  });
});

describe("rankChange", () => {
  it("is positive when moving up", () => {
    expect(rankChange(3, 1)).toBe(2);
    expect(rankChange(1, 2)).toBe(-1);
    expect(rankChange(null, 4)).toBe(0);
  });
});
