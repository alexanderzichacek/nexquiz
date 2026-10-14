import { describe, expect, it } from "vitest";
import type { TaggedAnswer } from "../schemas/answer.js";
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

  it("returns 0 for an option id the question does not have", () => {
    expect(value(singleScore({ optionId: "zzz" }, { correctId: "b" }))).toBe(0);
  });

  it("compares ids exactly (case-sensitive)", () => {
    expect(value(singleScore({ optionId: "B" }, { correctId: "b" }))).toBe(0);
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

/*
 * PENDING DECISION – multi `partial` with correct AND wrong options selected.
 *
 * The documented formula (LOGIC.md "multi") is
 * `max(0, (hits − wrongly selected) / correctIds.length)`, so with 2 correct
 * options, 1 correct + 1 wrong scores 0. Whether this formula stays is being
 * decided. Keep every mixed-selection case in this block (and the matching
 * GameService case in apps/api/src/game/questionTypes.test.ts) so the decision
 * touches one place.
 *
 * The assertions below pre-date this block and pin the CURRENT formula; update
 * or replace them together with `multiScore` and LOGIC.md.
 */
describe("multiScore – partial with correct and wrong options mixed", () => {
  // A wrong pick costs half of a hit: max(0, (hits − 0.5 × wrong) / correctIds.length).
  const correctIds = ["a", "b"];
  const partial = (optionIds: string[], ids = correctIds) => value(multiScore({ optionIds }, { correctIds: ids, scoring: "partial" }));

  it("1 correct + 1 wrong of 2 correct scores a quarter (reported case, was 0)", () => {
    expect(partial(["a", "c"])).toBe(0.25);
  });

  it("all correct + 1 wrong of 2 correct scores three quarters", () => {
    expect(partial(["a", "b", "c"])).toBe(0.75);
  });

  it("selecting every option of 4 (2 correct) scores a half", () => {
    expect(partial(["a", "b", "c", "d"])).toBe(0.5);
  });

  it("1 correct + 2 wrong scores 0, never negative", () => {
    expect(partial(["a", "c", "d"])).toBe(0);
  });

  it("1 correct + 1 wrong of 3 correct is an exact sixth", () => {
    const f = multiScore({ optionIds: ["a", "d"] }, { correctIds: ["a", "b", "c"], scoring: "partial" });
    expect(f.num * 6).toBe(f.den);
  });
});

describe("multiScore – edge cases", () => {
  const correctIds = ["a", "c"];

  it("all: 1 for every correct option in any order", () => {
    expect(value(multiScore({ optionIds: ["c", "a"] }, { correctIds, scoring: "all" }))).toBe(1);
  });

  it("all: 0 for only wrong options and for an empty selection", () => {
    expect(value(multiScore({ optionIds: ["b", "d"] }, { correctIds, scoring: "all" }))).toBe(0);
    expect(value(multiScore({ optionIds: ["b"] }, { correctIds, scoring: "all" }))).toBe(0);
    expect(value(multiScore({ optionIds: [] }, { correctIds, scoring: "all" }))).toBe(0);
  });

  it("all: duplicate selections of the exact set still count as the exact set", () => {
    expect(value(multiScore({ optionIds: ["a", "a", "c"] }, { correctIds, scoring: "all" }))).toBe(1);
  });

  it("partial: only wrong options score 0, never a negative value", () => {
    const f = multiScore({ optionIds: ["b", "d"] }, { correctIds, scoring: "partial" });
    expect(f.num).toBe(0);
    expect(value(multiScore({ optionIds: ["b"] }, { correctIds, scoring: "partial" }))).toBe(0);
  });

  it("partial: an empty selection scores 0", () => {
    expect(value(multiScore({ optionIds: [] }, { correctIds, scoring: "partial" }))).toBe(0);
  });

  it("partial: a correct subset scores its exact share", () => {
    const three = ["a", "b", "c"];
    expect(multiScore({ optionIds: ["a", "c"] }, { correctIds: three, scoring: "partial" })).toEqual({ num: 2, den: 3 });
    expect(value(multiScore({ optionIds: ["a", "c"] }, { correctIds: three, scoring: "partial" }))).toBe(0.667);
    expect(value(multiScore({ optionIds: ["c", "b", "a"] }, { correctIds: three, scoring: "partial" }))).toBe(1);
  });

  it("partial: duplicate correct selections count once", () => {
    expect(value(multiScore({ optionIds: ["c", "c", "c"] }, { correctIds, scoring: "partial" }))).toBe(0.5);
  });

  it("scores 0 when the question has no correct options", () => {
    expect(value(multiScore({ optionIds: ["a"] }, { correctIds: [], scoring: "partial" }))).toBe(0);
    expect(value(multiScore({ optionIds: ["a"] }, { correctIds: [], scoring: "all" }))).toBe(0);
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

describe("orderScore – edge cases", () => {
  const correct = ["a", "b", "c", "d"];

  it("partial: swapping the first and the last item clips at 0 (1 of 6 pairs concordant)", () => {
    expect(orderScore(["d", "b", "c", "a"], correct)).toEqual({ num: 0, den: 6 });
  });

  it("partial: a non-adjacent swap (a ↔ c) leaves tau = 0", () => {
    expect(value(orderScore(["c", "b", "a", "d"], correct))).toBe(0);
  });

  it("partial: moving the last item to the front leaves 3 of 6 pairs concordant → 0", () => {
    expect(value(orderScore(["d", "a", "b", "c"], correct))).toBe(0);
  });

  it("partial: one adjacent swap in 8 items keeps an exact 13/14", () => {
    const eight = ["1", "2", "3", "4", "5", "6", "7", "8"];
    const swapped = ["1", "2", "3", "5", "4", "6", "7", "8"];
    // 27 of 28 pairs concordant → (54 − 28) / 28
    expect(orderScore(swapped, eight)).toEqual({ num: 26, den: 28 });
    expect(value(orderScore(swapped, eight))).toBe(0.929);
  });

  it("partial: one swap in 3 items is an exact third", () => {
    expect(orderScore(["b", "a", "c"], ["a", "b", "c"])).toEqual({ num: 1, den: 3 });
  });

  it("all: 0 for the reversed order", () => {
    expect(value(orderScore(["d", "c", "b", "a"], correct, "all"))).toBe(0);
  });

  it("all: 0 for answers that are not a permutation", () => {
    expect(value(orderScore(["a", "b", "c"], correct, "all"))).toBe(0);
    expect(value(orderScore(["a", "b", "c", "d", "e"], correct, "all"))).toBe(0);
    expect(value(orderScore(["a", "b", "b", "d"], correct, "all"))).toBe(0);
    expect(value(orderScore(["a", "b", "c", "x"], correct, "all"))).toBe(0);
  });

  it("returns 0 for an empty answer in both modes", () => {
    expect(value(orderScore([], correct))).toBe(0);
    expect(value(orderScore([], correct, "all"))).toBe(0);
  });

  it("returns 0 for an extra item even when the rest is in order", () => {
    expect(value(orderScore(["a", "b", "c", "d", "e"], correct))).toBe(0);
  });
});

describe("hotspotScore – edge cases", () => {
  const center = { shape: "circle" as const, x: 0.5, y: 0.5, r: 0.1 };

  it("hits just inside and misses just outside the radius", () => {
    expect(value(hotspotScore({ x: 0.5999, y: 0.5 }, [center], 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.6001, y: 0.5 }, [center], 1))).toBe(0);
    expect(value(hotspotScore({ x: 0.5, y: 0.4001 }, [center], 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.5, y: 0.3999 }, [center], 1))).toBe(0);
  });

  it("uses the Euclidean distance on diagonals", () => {
    // distance ≈ 0.099 → inside, ≈ 0.113 → outside (although |dx|, |dy| < r)
    expect(value(hotspotScore({ x: 0.57, y: 0.57 }, [center], 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.58, y: 0.58 }, [center], 1))).toBe(0);
  });

  it("stretches the y radius on a landscape image (aspect 0.5)", () => {
    // 0.2 of height = 0.1 of width → on the edge; 0.21 → outside
    expect(value(hotspotScore({ x: 0.5, y: 0.7 }, [center], 0.5))).toBe(1);
    expect(value(hotspotScore({ x: 0.5, y: 0.71 }, [center], 0.5))).toBe(0);
  });

  it("handles taps on the image corners and targets reaching beyond the image", () => {
    const corner = { shape: "circle" as const, x: 0, y: 0, r: 0.1 };
    expect(value(hotspotScore({ x: 0, y: 0 }, [corner], 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.05, y: 0.05 }, [corner], 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.1, y: 0.1 }, [corner], 1))).toBe(0);
    const rightEdge = { shape: "circle" as const, x: 1, y: 0.5, r: 0.2 };
    expect(value(hotspotScore({ x: 1, y: 0.5 }, [rightEdge], 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.85, y: 0.5 }, [rightEdge], 1))).toBe(1);
    expect(value(hotspotScore({ x: 1, y: 1 }, [rightEdge], 1))).toBe(0);
  });

  it("scores 1 (not more) inside overlapping targets", () => {
    const overlapping = [center, { shape: "circle" as const, x: 0.55, y: 0.5, r: 0.1 }];
    expect(hotspotScore({ x: 0.55, y: 0.5 }, overlapping, 1)).toEqual({ num: 1, den: 1 });
  });

  it("hits the last of several targets", () => {
    const targets = [
      { shape: "circle" as const, x: 0.1, y: 0.1, r: 0.05 },
      { shape: "circle" as const, x: 0.9, y: 0.1, r: 0.05 },
      { shape: "circle" as const, x: 0.5, y: 0.9, r: 0.05 },
    ];
    expect(value(hotspotScore({ x: 0.52, y: 0.88 }, targets, 1))).toBe(1);
    expect(value(hotspotScore({ x: 0.5, y: 0.5 }, targets, 1))).toBe(0);
  });
});

describe("textScore – edge cases", () => {
  const fields = [{ key: "answer" as const, weight: 1 as const, accepted: ["Bratislava", "BA"] }];

  it("ignores case, diacritics, surrounding whitespace and punctuation", () => {
    for (const answer of ["BRATISLAVA", "Bratisláva", "  bratislava  ", "Bratislava!"]) {
      expect(value(textScore({ answer }, fields, "normal").correctness)).toBe(1);
    }
  });

  it("accepts any alias, also a short one written differently", () => {
    expect(value(textScore({ answer: "ba" }, fields, "normal").correctness)).toBe(1);
    expect(value(textScore({ answer: "B.A." }, fields, "normal").correctness)).toBe(1);
  });

  it("applies the tolerance thresholds of a 10-character alias", () => {
    // bratslava: 1 edit, bratslav: 2 edits, brtslav: 3 edits
    expect(value(textScore({ answer: "Bratslava" }, fields, "strict").correctness)).toBe(1);
    expect(value(textScore({ answer: "Bratslav" }, fields, "strict").correctness)).toBe(0);
    expect(value(textScore({ answer: "Bratslav" }, fields, "normal").correctness)).toBe(1);
    expect(value(textScore({ answer: "Brtslav" }, fields, "normal").correctness)).toBe(0);
    expect(value(textScore({ answer: "Brtslav" }, fields, "loose").correctness)).toBe(1);
  });

  it("requires an exact short alias except with loose tolerance", () => {
    expect(value(textScore({ answer: "BB" }, fields, "normal").correctness)).toBe(0);
    expect(value(textScore({ answer: "BB" }, fields, "loose").correctness)).toBe(1);
  });

  it("scores 0 for empty, whitespace-only, punctuation-only and missing answers", () => {
    const inputs: Record<string, string>[] = [{ answer: "" }, { answer: "   " }, { answer: "?!" }, {}];
    for (const answers of inputs) {
      const r = textScore(answers, fields, "loose");
      expect(value(r.correctness)).toBe(0);
      expect(r.perField).toEqual({ answer: false });
      expect(r.normalized).toEqual({ answer: "" });
    }
  });

  it("returns the exact correctness and the normalized input", () => {
    const r = textScore({ answer: "Bratisláva!" }, fields, "normal");
    expect(r.correctness).toEqual({ num: 1000, den: 1000 });
    expect(r.perField).toEqual({ answer: true });
    expect(r.normalized).toEqual({ answer: "bratislava" });
  });

  it("ignores aliases that normalize to an empty string", () => {
    const withEmpty = [{ key: "answer" as const, weight: 1 as const, accepted: ["(Intro)", "Yesterday"] }];
    expect(value(textScore({ answer: "a" }, withEmpty, "loose").correctness)).toBe(0);
    expect(value(textScore({ answer: "yesterday" }, withEmpty, "loose").correctness)).toBe(1);
  });

  it("host override can reject an exact match and accept a wrong answer", () => {
    expect(value(textScore({ answer: "Bratislava" }, fields, "normal", () => false).correctness)).toBe(0);
    expect(value(textScore({ answer: "Pozsony" }, fields, "normal", () => true).correctness)).toBe(1);
  });
});

describe("musicScore – edge cases", () => {
  const fields = [
    { key: "artist" as const, weight: 0.5, accepted: ["Metallica"] },
    { key: "title" as const, weight: 0.5, accepted: ["One"] },
  ];

  it("title only scores the title weight", () => {
    const r = musicScore({ artist: "Megadeth", title: "one" }, fields, "normal");
    expect(r.correctness).toEqual({ num: 500, den: 1000 });
    expect(r.perField).toEqual({ artist: false, title: true });
  });

  it("neither field, empty fields and missing fields score 0", () => {
    expect(value(musicScore({ artist: "Megadeth", title: "Two" }, fields, "normal").correctness)).toBe(0);
    const empty = musicScore({ artist: "", title: "  " }, fields, "normal");
    expect(value(empty.correctness)).toBe(0);
    expect(empty.perField).toEqual({ artist: false, title: false });
    expect(value(musicScore({}, fields, "normal").correctness)).toBe(0);
  });

  it("a missing field does not affect the other one", () => {
    expect(value(musicScore({ artist: "Metallica" }, fields, "normal").correctness)).toBe(0.5);
  });

  it("evaluates the fields independently (each with its own alias length)", () => {
    // "metalika": 2 edits on 9 chars → ok; "on": 1 edit on 3 chars → not ok
    const r = musicScore({ artist: "Metalika", title: "On" }, fields, "normal");
    expect(r.perField).toEqual({ artist: true, title: false });
  });

  it("supports weights in thousandths (0.333 / 0.667)", () => {
    const thirds = [
      { key: "artist" as const, weight: 0.333, accepted: ["Queen"] },
      { key: "title" as const, weight: 0.667, accepted: ["Bohemian Rhapsody"] },
    ];
    expect(musicScore({ artist: "Queen", title: "x" }, thirds, "normal").correctness).toEqual({ num: 333, den: 1000 });
    expect(musicScore({ artist: "x", title: "Bohemian Rhapsody" }, thirds, "normal").correctness).toEqual({
      num: 667,
      den: 1000,
    });
    expect(value(musicScore({ artist: "Queen", title: "Bohemian Rhapsody" }, thirds, "normal").correctness)).toBe(1);
  });

  it("normalizes each field for grouping", () => {
    const r = musicScore({ artist: "The Metallica", title: "One (Remastered)" }, fields, "normal");
    expect(r.normalized).toEqual({ artist: "metallica", title: "one" });
  });
});

describe("scoreAnswer – every type", () => {
  const base = { id: "7f0b6c1e-3c1a-4c55-9a43-0d6f8f6d2a11", prompt: "Q", timeLimit: 30, points: 1000 };
  const options = [
    { id: "a", text: "A" },
    { id: "b", text: "B" },
    { id: "c", text: "C" },
  ];
  const questions: Record<Question["type"], Question> = {
    single: { ...base, type: "single", data: { options, correctId: "a" } },
    multi: { ...base, type: "multi", data: { options, correctIds: ["a", "b"], scoring: "partial" } },
    order: { ...base, type: "order", data: { items: options, scoring: "all" } },
    hotspot: {
      ...base,
      type: "hotspot",
      media: { imageId: "7f0b6c1e-3c1a-4c55-9a43-0d6f8f6d2a12" },
      data: { targets: [{ shape: "circle", x: 0.5, y: 0.5, r: 0.1 }] },
    },
    text: {
      ...base,
      type: "text",
      data: { fields: [{ key: "answer", weight: 1, accepted: ["Bratislava"] }], tolerance: "normal" },
    },
    music: {
      ...base,
      type: "music",
      media: { audioId: "7f0b6c1e-3c1a-4c55-9a43-0d6f8f6d2a13" },
      data: {
        clip: { start: 0, duration: 15 },
        fields: [
          { key: "artist", weight: 0.5, accepted: ["Metallica"] },
          { key: "title", weight: 0.5, accepted: ["One"] },
        ],
        tolerance: "normal",
      },
    },
    number: { ...base, type: "number", data: { answer: 42, mode: "tolerance", tolerance: 0 } },
  };
  const correctAnswers: Record<Question["type"], TaggedAnswer> = {
    single: { type: "single", payload: { optionId: "a" } },
    multi: { type: "multi", payload: { optionIds: ["b", "a"] } },
    order: { type: "order", payload: { order: ["a", "b", "c"] } },
    hotspot: { type: "hotspot", payload: { x: 0.5, y: 0.5 } },
    text: { type: "text", payload: { answers: { answer: "Bratislava" } } },
    music: { type: "music", payload: { answers: { artist: "Metallica", title: "One" } } },
    number: { type: "number", payload: { value: 42 } },
  };
  const types = Object.keys(questions) as Question["type"][];

  it.each(types)("%s: a correct answer scores 1", (type) => {
    expect(value(scoreAnswer(questions[type], correctAnswers[type]).correctness)).toBe(1);
  });

  it.each(types)("%s: an answer of any other type scores 0", (type) => {
    for (const other of types.filter((t) => t !== type)) {
      expect(value(scoreAnswer(questions[type], correctAnswers[other]).correctness)).toBe(0);
    }
  });

  it("multi partial: a correct subset gets its share", () => {
    expect(value(scoreAnswer(questions.multi, { type: "multi", payload: { optionIds: ["b"] } }).correctness)).toBe(0.5);
  });

  it("order all: any deviation scores 0", () => {
    expect(value(scoreAnswer(questions.order, { type: "order", payload: { order: ["a", "c", "b"] } }).correctness)).toBe(0);
  });

  it("text / music pass the override lookup through", () => {
    const r = scoreAnswer(
      questions.music,
      { type: "music", payload: { answers: { artist: "Metallica", title: "Two" } } },
      { override: (key, normalized) => (key === "title" && normalized === "two" ? true : undefined) },
    );
    expect(value(r.correctness)).toBe(1);
    expect(r.perField).toEqual({ artist: true, title: true });
  });
});
