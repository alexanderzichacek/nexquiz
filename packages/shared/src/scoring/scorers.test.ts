import { describe, expect, it } from "vitest";
import type { MusicQuestion, Question, TextQuestion } from "../schemas/question.js";
import { fractionToNumber } from "./fraction.js";
import {
  fieldsScore,
  hotspotScore,
  inCircle,
  multiScore,
  musicScore,
  orderScore,
  scoreAnswer,
  singleScore,
  textScore,
} from "./scorers.js";

const value = fractionToNumber;

describe("singleScore", () => {
  it("returns 1 for the correct option and 0 otherwise", () => {
    expect(value(singleScore({ optionId: "b" }, { correctId: "b" }))).toBe(1);
    expect(value(singleScore({ optionId: "a" }, { correctId: "b" }))).toBe(0);
  });
});

describe("multiScore", () => {
  const correctIds = ["a", "b"];

  it("all: 1 only for an exact set match", () => {
    expect(value(multiScore({ optionIds: ["b", "a"] }, { correctIds, scoring: "all" }))).toBe(1);
    expect(value(multiScore({ optionIds: ["a"] }, { correctIds, scoring: "all" }))).toBe(0);
    expect(value(multiScore({ optionIds: ["a", "b", "c"] }, { correctIds, scoring: "all" }))).toBe(0);
  });

  it("partial: (hits − wrong) / correct, clipped at 0", () => {
    expect(value(multiScore({ optionIds: ["a", "b"] }, { correctIds, scoring: "partial" }))).toBe(1);
    expect(value(multiScore({ optionIds: ["a"] }, { correctIds, scoring: "partial" }))).toBe(0.5);
    expect(value(multiScore({ optionIds: ["a", "b", "c"] }, { correctIds, scoring: "partial" }))).toBe(0.5);
    expect(value(multiScore({ optionIds: ["a", "c"] }, { correctIds, scoring: "partial" }))).toBe(0);
    expect(value(multiScore({ optionIds: ["c", "d"] }, { correctIds, scoring: "partial" }))).toBe(0);
  });

  it("partial keeps exact thirds", () => {
    const f = multiScore({ optionIds: ["a"] }, { correctIds: ["a", "b", "c"], scoring: "partial" });
    expect(f).toEqual({ num: 1, den: 3 });
    expect(value(f)).toBe(0.333);
  });

  it("ignores duplicate selections", () => {
    expect(value(multiScore({ optionIds: ["a", "a"] }, { correctIds, scoring: "partial" }))).toBe(0.5);
  });
});

describe("orderScore", () => {
  const correct = ["a", "b", "c", "d"];

  it("returns 1 for the correct order", () => {
    expect(value(orderScore(correct, correct))).toBe(1);
    expect(value(orderScore(correct, correct, "all"))).toBe(1);
  });

  it("returns 0 for the reversed order (tau = −1 clipped)", () => {
    expect(value(orderScore(["d", "c", "b", "a"], correct))).toBe(0);
  });

  it("uses normalized Kendall tau for partial", () => {
    // one adjacent swap: 5 of 6 pairs concordant → (10 − 6) / 6 = 2/3
    expect(orderScore(["b", "a", "c", "d"], correct)).toEqual({ num: 4, den: 6 });
    expect(value(orderScore(["a", "c", "b", "d"], correct))).toBe(0.667);
    // two swaps: 4 of 6 concordant → 1/3
    expect(value(orderScore(["b", "a", "d", "c"], correct))).toBe(0.333);
    // 3 of 6 concordant → tau = 0
    expect(value(orderScore(["c", "a", "d", "b"], correct))).toBe(0);
  });

  it("all: 0 for any deviation", () => {
    expect(value(orderScore(["b", "a", "c", "d"], correct, "all"))).toBe(0);
  });

  it("returns 0 for answers that are not a permutation", () => {
    expect(value(orderScore(["a", "b", "c"], correct))).toBe(0);
    expect(value(orderScore(["a", "a", "b", "c"], correct))).toBe(0);
    expect(value(orderScore(["a", "b", "c", "x"], correct))).toBe(0);
  });

  it("random order has expected value 0 for 3 items (no free points on average)", () => {
    const items = ["a", "b", "c"];
    const perms = [
      ["a", "b", "c"],
      ["a", "c", "b"],
      ["b", "a", "c"],
      ["b", "c", "a"],
      ["c", "a", "b"],
      ["c", "b", "a"],
    ];
    // tau values: 1, 1/3, 1/3, -1/3, -1/3, -1 → average 0 before clipping
    const scores = perms.map((p) => value(orderScore(p, items)));
    expect(scores).toEqual([1, 0.333, 0.333, 0, 0, 0]);
  });
});

describe("inCircle / hotspotScore", () => {
  const target = { shape: "circle" as const, x: 0.5, y: 0.5, r: 0.1 };

  it("hits inside and on the edge, misses outside", () => {
    expect(inCircle({ x: 0.5, y: 0.5 }, target, 1)).toBe(true);
    expect(inCircle({ x: 0.6, y: 0.5 }, target, 1)).toBe(true);
    expect(inCircle({ x: 0.61, y: 0.5 }, target, 1)).toBe(false);
  });

  it("converts y to width units using aspect = height / width", () => {
    // 2:1 landscape image → aspect 0.5: 0.15 of height = 0.075 of width
    expect(inCircle({ x: 0.5, y: 0.65 }, target, 0.5)).toBe(true);
    expect(inCircle({ x: 0.5, y: 0.65 }, target, 1)).toBe(false);
    // x distance is unaffected by the aspect
    expect(inCircle({ x: 0.65, y: 0.5 }, target, 0.5)).toBe(false);
    // portrait image (aspect 2): y distances count double
    expect(inCircle({ x: 0.5, y: 0.56 }, target, 2)).toBe(false);
  });

  it("scores 1 when any target is hit", () => {
    const targets = [target, { shape: "circle" as const, x: 0.1, y: 0.1, r: 0.05 }];
    expect(value(hotspotScore({ x: 0.12, y: 0.1 }, targets, 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.9, y: 0.9 }, targets, 1))).toBe(0);
  });
});

describe("text / music scoring", () => {
  const textFields = [{ key: "answer" as const, weight: 1 as const, accepted: ["Gerlachovský štít", "Gerlach"] }];
  const musicFields = [
    { key: "artist" as const, weight: 0.5, accepted: ["Metallica"] },
    { key: "title" as const, weight: 0.5, accepted: ["Nothing Else Matters"] },
  ];

  it("text: 1 for a fuzzy match, 0 otherwise", () => {
    expect(value(textScore({ answer: "gerlachovsky stit" }, textFields, "normal").correctness)).toBe(1);
    expect(value(textScore({ answer: "Gerlah" }, textFields, "normal").correctness)).toBe(1);
    expect(value(textScore({ answer: "Lomnický štít" }, textFields, "normal").correctness)).toBe(0);
    expect(value(textScore({ answer: "" }, textFields, "normal").correctness)).toBe(0);
  });

  it("music: sums weights of matching fields", () => {
    const both = musicScore({ artist: "metalica", title: "nothing else maters" }, musicFields, "normal");
    expect(value(both.correctness)).toBe(1);
    expect(both.perField).toEqual({ artist: true, title: true });

    const artistOnly = musicScore({ artist: "Metallica", title: "Enter Sandman" }, musicFields, "normal");
    expect(value(artistOnly.correctness)).toBe(0.5);
    expect(artistOnly.perField).toEqual({ artist: true, title: false });
    expect(artistOnly.normalized).toEqual({ artist: "metallica", title: "enter sandman" });
  });

  it("music: supports uneven weights exactly", () => {
    const fields = [
      { key: "artist" as const, weight: 0.3, accepted: ["Queen"] },
      { key: "title" as const, weight: 0.7, accepted: ["Bohemian Rhapsody"] },
    ];
    expect(musicScore({ artist: "x", title: "bohemian rhapsody" }, fields, "normal").correctness).toEqual({
      num: 700,
      den: 1000,
    });
    expect(value(musicScore({ artist: "queen", title: "bohemian rhapsody" }, fields, "normal").correctness)).toBe(1);
  });

  it("host override takes precedence over automatic matching", () => {
    const accept = fieldsScore({ artist: "Metallica", title: "Unforgiven" }, musicFields, "normal", (key, normalized) =>
      key === "title" && normalized === "unforgiven" ? true : undefined,
    );
    expect(value(accept.correctness)).toBe(1);

    const reject = fieldsScore({ artist: "Metallica", title: "Nothing Else Matters" }, musicFields, "normal", (key) =>
      key === "artist" ? false : undefined,
    );
    expect(value(reject.correctness)).toBe(0.5);
    expect(reject.perField).toEqual({ artist: false, title: true });
  });

  it("override is not applied to empty answers", () => {
    const r = fieldsScore({ answer: "  " }, textFields, "normal", () => true);
    expect(value(r.correctness)).toBe(0);
  });
});

describe("scoreAnswer", () => {
  const base = { id: "7f0b6c1e-3c1a-4c55-9a43-0d6f8f6d2a11", prompt: "Q", timeLimit: 30, points: 1 };

  it("dispatches by question type", () => {
    const single: Question = {
      ...base,
      type: "single",
      data: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctId: "a" },
    };
    expect(value(scoreAnswer(single, { type: "single", payload: { optionId: "a" } }).correctness)).toBe(1);
  });

  it("scores 0 when the answer type does not match", () => {
    const single: Question = {
      ...base,
      type: "single",
      data: { options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctId: "a" },
    };
    expect(value(scoreAnswer(single, { type: "hotspot", payload: { x: 0, y: 0 } }).correctness)).toBe(0);
  });

  it("uses the image aspect for hotspot", () => {
    const q: Question = {
      ...base,
      type: "hotspot",
      media: { imageId: "7f0b6c1e-3c1a-4c55-9a43-0d6f8f6d2a12" },
      data: { targets: [{ shape: "circle", x: 0.5, y: 0.5, r: 0.1 }] },
    };
    const answer = { type: "hotspot" as const, payload: { x: 0.5, y: 0.65 } };
    expect(value(scoreAnswer(q, answer, { imageAspect: 0.5 }).correctness)).toBe(1);
    expect(value(scoreAnswer(q, answer).correctness)).toBe(0);
  });

  it("scores order using the correct item order", () => {
    const q: Question = {
      ...base,
      type: "order",
      data: {
        items: [
          { id: "a", text: "A" },
          { id: "b", text: "B" },
          { id: "c", text: "C" },
        ],
        scoring: "partial",
      },
    };
    expect(value(scoreAnswer(q, { type: "order", payload: { order: ["a", "c", "b"] } }).correctness)).toBe(0.333);
  });

  it("scores text and music with per-field results", () => {
    const text: TextQuestion = {
      ...base,
      type: "text",
      data: { fields: [{ key: "answer", weight: 1, accepted: ["Bratislava", "BA"] }], tolerance: "normal" },
    };
    const r = scoreAnswer(text, { type: "text", payload: { answers: { answer: "Bratislawa" } } });
    expect(value(r.correctness)).toBe(1);
    expect(r.perField).toEqual({ answer: true });

    const music: MusicQuestion = {
      ...base,
      type: "music",
      media: { audioId: "7f0b6c1e-3c1a-4c55-9a43-0d6f8f6d2a13" },
      data: {
        clip: { start: 45, duration: 15 },
        fields: [
          { key: "artist", weight: 0.5, accepted: ["The Beatles"] },
          { key: "title", weight: 0.5, accepted: ["Hey Jude"] },
        ],
        tolerance: "normal",
      },
    };
    const m = scoreAnswer(music, { type: "music", payload: { answers: { artist: "Beatles", title: "Yesterday" } } });
    expect(value(m.correctness)).toBe(0.5);
    expect(m.perField).toEqual({ artist: true, title: false });
  });
});
