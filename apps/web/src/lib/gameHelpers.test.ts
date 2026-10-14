import { describe, expect, it } from "vitest";
import { hostChoiceColumns, playerChoiceGrid } from "@/components/choiceLayout";
import { nicknameColor, optionColor, optionLetter } from "@/components/options";
import { optionIndexForKey } from "./answerKeys";
import { formatDelta, formatPercent, formatScore, resultKind } from "./format";
import { containRect, fromUnitPoint, toClampedUnitPoint, toUnitPoint } from "./imageFit";
import { byPreviousRank, byRank, podiumOrder, previousRank, rankingRest } from "./leaderboard";
import { activeMilestone, clockOffset, remainingMs, remainingSeconds } from "./serverClock";
import { easeOut } from "./useCountUp";

describe("server clock", () => {
  it("shows the countdown from deadline − (now + offset)", () => {
    const offset = clockOffset(10_000, 9_000); // client is 1 s behind
    expect(offset).toBe(1_000);
    expect(remainingMs(20_000, offset, 9_000)).toBe(10_000);
    expect(remainingMs(20_000, offset, 30_000)).toBe(0);
    expect(remainingSeconds(4_001)).toBe(5);
    expect(remainingSeconds(0)).toBe(0);
  });

  it("announces only the 10 s and 5 s milestones", () => {
    expect(activeMilestone(30)).toBeNull();
    expect(activeMilestone(10)).toBe(10);
    expect(activeMilestone(6)).toBe(10);
    expect(activeMilestone(5)).toBe(5);
    expect(activeMilestone(1)).toBe(5);
    expect(activeMilestone(0)).toBeNull();
  });
});

describe("keyboard answers", () => {
  it("maps A–F and 1–6 to option indexes", () => {
    expect(optionIndexForKey("a", 4)).toBe(0);
    expect(optionIndexForKey("D", 4)).toBe(3);
    expect(optionIndexForKey("2", 4)).toBe(1);
    expect(optionIndexForKey("e", 4)).toBeNull();
    expect(optionIndexForKey("6", 6)).toBe(5);
    expect(optionIndexForKey("Enter", 4)).toBeNull();
  });
});

describe("hotspot coordinates under object-fit: contain", () => {
  // 400 × 400 box, 800 × 400 image → displayed 400 × 200, letterbox 100 px top and bottom.
  const rect = containRect({ width: 400, height: 400 }, { width: 800, height: 400 });

  it("normalizes to the displayed image, not the box", () => {
    expect(rect).toEqual({ left: 0, top: 100, width: 400, height: 200 });
    expect(toUnitPoint(rect, 200, 200)).toEqual({ x: 0.5, y: 0.5 });
    expect(toUnitPoint(rect, 100, 150)).toEqual({ x: 0.25, y: 0.25 });
  });

  it("ignores taps in the letterbox and clamps drags to the image", () => {
    expect(toUnitPoint(rect, 200, 50)).toBeNull();
    expect(toClampedUnitPoint(rect, 500, 50)).toEqual({ x: 1, y: 0 });
    expect(fromUnitPoint(rect, { x: 0.5, y: 1 })).toEqual({ left: 200, top: 300 });
  });
});

describe("leaderboard helpers", () => {
  const entries = [
    { id: "a", rank: 1, rankChange: 1 },
    { id: "b", rank: 2, rankChange: -1 },
    { id: "c", rank: 3, rankChange: 0 },
  ];

  it("orders rows by the previous rank for the FLIP start", () => {
    expect(previousRank({ rank: 1, rankChange: 1 })).toBe(2);
    expect(byPreviousRank(entries).map((e) => e.id)).toEqual(["b", "a", "c"]);
    expect(byRank([...entries].reverse()).map((e) => e.id)).toEqual(["a", "b", "c"]);
  });

  it("shows the podium as 2 – 1 – 3", () => {
    expect(podiumOrder([{ rank: 1 }, { rank: 2 }, { rank: 3 }]).map((e) => e.rank)).toEqual([2, 1, 3]);
    expect(podiumOrder([{ rank: 1 }, { rank: 2 }]).map((e) => e.rank)).toEqual([2, 1]);
    expect(podiumOrder([{ rank: 1 }]).map((e) => e.rank)).toEqual([1]);
  });

  it("splits the final ranking into the podium and the rest", () => {
    const ranking = [
      { playerId: "p1", rank: 1 },
      { playerId: "p2", rank: 2 },
      { playerId: "p3", rank: 3 },
      { playerId: "p4", rank: 3 },
      { playerId: "p6", rank: 6 },
      { playerId: "p5", rank: 5 },
    ];
    const podium = ranking.slice(0, 3);
    // tie on the 3rd place that did not fit on the podium stays in the rest, rest is in rank order
    expect(rankingRest(ranking, podium).map((e) => e.playerId)).toEqual(["p4", "p5", "p6"]);
    expect(rankingRest(ranking.slice(0, 2), ranking.slice(0, 2))).toEqual([]);
    expect(rankingRest([], [])).toEqual([]);
  });
});

describe("formatting", () => {
  it("formats scores, deltas, percent and result kinds", () => {
    // Whole points, thousands separated by a non-breaking space.
    expect(formatScore(842)).toBe("842");
    expect(formatScore(12_450)).toBe("12\u00A0450");
    expect(formatScore(1_000_000)).toBe("1\u00A0000\u00A0000");
    expect(formatScore(749.6)).toBe("750");
    expect(formatScore(0)).toBe("0");
    expect(formatDelta(850)).toBe("+850");
    expect(formatDelta(1_250)).toBe("+1\u00A0250");
    expect(formatDelta(0)).toBe("+0");
    expect(formatPercent(0.643)).toBe(64);
    expect(resultKind(1)).toBe("correct");
    expect(resultKind(0.5)).toBe("partial");
    expect(resultKind(0)).toBe("wrong");
  });

  it("eases the count-up to the exact target", () => {
    expect(easeOut(0)).toBe(0);
    expect(easeOut(1)).toBe(1);
    expect(easeOut(2)).toBe(1);
    expect(easeOut(0.5)).toBeGreaterThan(0.5);
  });
});

describe("option mapping and layout", () => {
  it("maps options to letter and color token", () => {
    expect(optionLetter(0)).toBe("A");
    expect(optionLetter(5)).toBe("F");
    expect(optionColor(2)).toBe("var(--opt-3)");
    expect(nicknameColor("Jano")).toBe(nicknameColor("Jano"));
    expect(nicknameColor("Jano")).toMatch(/^var\(--opt-[1-6]\)$/);
  });

  it("puts player tiles side by side unless the options are long", () => {
    expect(playerChoiceGrid([{ text: "Sydney" }, { text: "Canberra" }])).toBe(true);
    expect(playerChoiceGrid([{ text: "Toto je veľmi dlhá odpoveď" }, { text: "B" }])).toBe(false);
    expect(playerChoiceGrid(Array.from({ length: 5 }, () => ({ text: "x" })))).toBe(true);
    expect(hostChoiceColumns(4)).toBe(2);
    expect(hostChoiceColumns(6)).toBe(3);
  });
});
