/**
 * End-to-end scoring of every question type through `GameService`: answers go
 * in through `submitAnswer`, the question ends, and the stored results, total
 * scores, `player:result` events, the leaderboard and persistence are checked.
 */
import {
  ANSWER_GRACE_MS,
  gameFinishedEventSchema,
  leaderboardEventSchema,
  playerResultEventSchema,
  questionRevealEventSchema,
  type LeaderboardEvent,
  type PlayerResultEvent,
  type Question,
  type Quiz,
  type QuizItem,
  type QuizSettings,
} from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import { createHarness, numberQuestion, sampleQuiz, samplePage, type Harness } from "../test/helpers.js";
import type { ResultRecord } from "../store/gameStore.js";

/** Array element that must exist (keeps `noUncheckedIndexedAccess` happy without `!`). */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`missing item ${index}`);
  return item;
}

type QuestionType = Question["type"];

/** A sample question of `type` (helpers.ts fixtures) worth `points`. */
function question<T extends QuestionType>(type: T, points = 1000): Extract<Question, { type: T }> {
  const all: Question[] = [...sampleQuiz().questions, numberQuestion()];
  const found = all.find((q): q is Extract<Question, { type: T }> => q.type === type);
  if (!found) throw new Error(`no sample ${type} question`);
  return { ...structuredClone(found), points };
}

function quizOf(items: QuizItem[], settings: Partial<QuizSettings> = {}): Quiz {
  return { ...sampleQuiz(settings), questions: items };
}

/** One answer of a player: payload + ms after the question started; `null` = no answer. */
type Submission = { payload: unknown; afterMs?: number } | null;

interface Played {
  h: Harness;
  pin: string;
  ids: string[];
  /** Stored result per player (`undefined` = no answer). */
  results: (ResultRecord | undefined)[];
  /** Total score per player (`game:{pin}:scores`). */
  scores: number[];
  /** `player:result` per player. */
  playerResults: PlayerResultEvent[];
  leaderboard: LeaderboardEvent;
}

/**
 * Plays a one-question quiz: player `P{i}` submits `submissions[i]`, the
 * question ends (on its own when everybody answered, otherwise by the host)
 * and the leaderboard is shown.
 */
async function playOne(q: Question, submissions: Submission[], settings: Partial<QuizSettings> = { speedBonus: false }): Promise<Played> {
  const h = createHarness(settings, quizOf([q], settings));
  const { pin } = await h.games.createGame(h.quiz.id);
  const ids: string[] = [];
  for (let i = 0; i < submissions.length; i++) ids.push((await h.games.join(pin, `P${i}`)).playerId);
  await h.games.start(pin);
  const t0 = h.clock.t;
  for (const [i, s] of submissions.entries()) {
    if (!s) continue;
    expect(await h.games.submitAnswer(pin, at(ids, i), 0, s.payload, t0 + (s.afterMs ?? 1_000))).toEqual({ ok: true });
  }
  await h.settle(pin);
  if ((await h.games.attachHost(pin)).state === "QUESTION") await h.games.endQuestion(pin);
  expect((await h.games.attachHost(pin)).state).toBe("REVEAL");

  const stored = await h.store.getResults(pin, 0);
  const totals = await h.store.getScores(pin);
  const events = h.notifier.of("playerResult");
  const playerResults = ids.map((id) =>
    playerResultEventSchema.parse(events.find((e) => e.kind === "playerResult" && e.playerId === id)?.payload),
  );
  await h.games.next(pin);
  const leaderboard = leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload);
  return {
    h,
    pin,
    ids,
    results: ids.map((id) => stored.get(id)),
    scores: ids.map((id) => totals.get(id) ?? Number.NaN),
    playerResults,
    leaderboard,
  };
}

/** `[nickname, score, rank]` in leaderboard order. */
function board(lb: LeaderboardEvent): [string, number, number][] {
  return lb.top.map((e) => [e.nickname, e.score, e.rank]);
}

/** Checks results, totals and `player:result` for every player (`null` result = did not answer). */
function expectScored(played: Played, expected: ({ correctness: number; points: number } | null)[]): void {
  expected.forEach((exp, i) => {
    const stored = played.results[i];
    if (exp === null) {
      expect(stored, `P${i} has no result`).toBeUndefined();
    } else {
      expect(stored, `P${i} result`).toMatchObject(exp);
    }
    const points = exp?.points ?? 0;
    expect(played.scores[i], `P${i} total`).toBe(points);
    expect(at(played.playerResults, i), `P${i} player:result`).toMatchObject({
      index: 0,
      correctness: exp?.correctness ?? 0,
      points,
      totalScore: points,
    });
  });
}

describe("single", () => {
  it("correct, wrong and no answer", async () => {
    const played = await playOne(question("single"), [{ payload: { optionId: "b" } }, { payload: { optionId: "a" } }, null]);
    expectScored(played, [{ correctness: 1, points: 1000 }, { correctness: 0, points: 0 }, null]);
    expect(at(played.playerResults, 2).yourAnswer).toBeNull();
    expect(board(played.leaderboard)[0]).toEqual(["P0", 1000, 1]);
    expect(board(played.leaderboard).slice(1).map(([, score, rank]) => [score, rank])).toEqual([
      [0, 2],
      [0, 2],
    ]);
  });

  it("speed bonus orders two correct answers by time", async () => {
    const played = await playOne(
      question("single"),
      [
        { payload: { optionId: "b" }, afterMs: 7_500 },
        { payload: { optionId: "b" }, afterMs: 2_500 },
        { payload: { optionId: "b" }, afterMs: 10_000 + ANSWER_GRACE_MS },
      ],
      { speedBonus: true },
    );
    // 10 s limit: 1 − 0.5 × 0.75 = 0.625, 1 − 0.5 × 0.25 = 0.875, after the limit 0.5
    expectScored(played, [
      { correctness: 1, points: 625 },
      { correctness: 1, points: 875 },
      { correctness: 1, points: 500 },
    ]);
    expect(board(played.leaderboard)).toEqual([
      ["P1", 875, 1],
      ["P0", 625, 2],
      ["P2", 500, 3],
    ]);
  });
});

describe("multi", () => {
  // Options a (2), b (4), c (5), d (9); correct: a, c.
  it("partial: all correct, a correct subset, only wrong and no answer", async () => {
    const played = await playOne(question("multi"), [
      { payload: { optionIds: ["c", "a"] } },
      { payload: { optionIds: ["c"] } },
      { payload: { optionIds: ["b", "d"] } },
      { payload: { optionIds: ["d"] } },
      null,
    ]);
    expectScored(played, [
      { correctness: 1, points: 1000 },
      { correctness: 0.5, points: 500 },
      { correctness: 0, points: 0 },
      { correctness: 0, points: 0 },
      null,
    ]);
    expect(board(played.leaderboard).slice(0, 2)).toEqual([
      ["P0", 1000, 1],
      ["P1", 500, 2],
    ]);
    const reveal = questionRevealEventSchema.parse(played.h.notifier.last("questionReveal")?.payload);
    expect(reveal.stats).toEqual({
      type: "multi",
      votes: [
        { optionId: "a", count: 1 },
        { optionId: "b", count: 1 },
        { optionId: "c", count: 2 },
        { optionId: "d", count: 2 },
      ],
    });
  });

  it("partial: a wrong pick costs half of a hit (1 correct + 1 wrong scores a quarter)", async () => {
    const played = await playOne(question("multi"), [
      { payload: { optionIds: ["a", "b"] } },
      { payload: { optionIds: ["a", "c", "b"] } },
      { payload: { optionIds: ["a", "b", "c", "d"] } },
      { payload: { optionIds: ["a", "b", "d"] } },
      null,
    ]);
    expectScored(played, [
      { correctness: 0.25, points: 250 },
      { correctness: 0.75, points: 750 },
      { correctness: 0.5, points: 500 },
      { correctness: 0, points: 0 },
      null,
    ]);
    expect(board(played.leaderboard).slice(0, 3)).toEqual([
      ["P1", 750, 1],
      ["P2", 500, 2],
      ["P0", 250, 3],
    ]);
  });

  it("all: only the exact set scores", async () => {
    const q = question("multi");
    q.data.scoring = "all";
    const played = await playOne(q, [
      { payload: { optionIds: ["a", "c"] } },
      { payload: { optionIds: ["a"] } },
      { payload: { optionIds: ["a", "b", "c"] } },
      { payload: { optionIds: ["b", "d"] } },
      null,
    ]);
    expectScored(played, [
      { correctness: 1, points: 1000 },
      { correctness: 0, points: 0 },
      { correctness: 0, points: 0 },
      { correctness: 0, points: 0 },
      null,
    ]);
  });
});

describe("order", () => {
  // Correct order: i1, i2, i3, i4 (sent to clients shuffled).
  it("partial: Kendall tau for correct, one swap, two swaps, reversed and no answer", async () => {
    const played = await playOne(question("order"), [
      { payload: { order: ["i1", "i2", "i3", "i4"] } },
      { payload: { order: ["i2", "i1", "i3", "i4"] } },
      { payload: { order: ["i2", "i1", "i4", "i3"] } },
      { payload: { order: ["i4", "i3", "i2", "i1"] } },
      null,
    ]);
    expectScored(played, [
      { correctness: 1, points: 1000 },
      { correctness: 0.667, points: 667 },
      { correctness: 0.333, points: 333 },
      { correctness: 0, points: 0 },
      null,
    ]);
    expect(board(played.leaderboard).slice(0, 3)).toEqual([
      ["P0", 1000, 1],
      ["P1", 667, 2],
      ["P2", 333, 3],
    ]);
    const reveal = questionRevealEventSchema.parse(played.h.notifier.last("questionReveal")?.payload);
    // (1 + 0.667 + 0.333 + 0) / 4 answers
    expect(reveal.stats).toEqual({ type: "order", averageCorrectness: 0.5 });
  });

  it("partial with speed bonus: 1000 × 2/3 × 3/4 is exactly 500", async () => {
    const played = await playOne(question("order"), [{ payload: { order: ["i2", "i1", "i3", "i4"] }, afterMs: 5_000 }], {
      speedBonus: true,
    });
    expectScored(played, [{ correctness: 0.667, points: 500 }]);
  });

  it("all: one swap scores 0", async () => {
    const q = question("order");
    q.data.scoring = "all";
    const played = await playOne(q, [
      { payload: { order: ["i1", "i2", "i3", "i4"] } },
      { payload: { order: ["i1", "i2", "i4", "i3"] } },
      null,
    ]);
    expectScored(played, [{ correctness: 1, points: 1000 }, { correctness: 0, points: 0 }, null]);
  });
});

describe("hotspot", () => {
  // Target (0.5, 0.5, r 0.1) on a 1000 × 500 image → aspect 0.5 (y distances count half).
  it("inside, inside only thanks to the image aspect, outside and no answer", async () => {
    const played = await playOne(question("hotspot"), [
      { payload: { x: 0.5, y: 0.5 } },
      { payload: { x: 0.5, y: 0.68 } },
      { payload: { x: 0.65, y: 0.5 } },
      null,
    ]);
    expectScored(played, [{ correctness: 1, points: 1000 }, { correctness: 1, points: 1000 }, { correctness: 0, points: 0 }, null]);
    const reveal = questionRevealEventSchema.parse(played.h.notifier.last("questionReveal")?.payload);
    expect(reveal.stats).toEqual({
      type: "hotspot",
      taps: [
        { x: 0.5, y: 0.5, hit: true },
        { x: 0.5, y: 0.68, hit: true },
        { x: 0.65, y: 0.5, hit: false },
      ],
    });
  });

  it("any of several targets counts", async () => {
    const q = question("hotspot");
    q.data.targets.push({ shape: "circle", x: 0.1, y: 0.1, r: 0.05 });
    const played = await playOne(q, [{ payload: { x: 0.12, y: 0.1 } }, { payload: { x: 0.9, y: 0.9 } }]);
    expectScored(played, [
      { correctness: 1, points: 1000 },
      { correctness: 0, points: 0 },
    ]);
  });

  it("rejects taps outside the image", async () => {
    const h = createHarness({}, quizOf([question("hotspot")]));
    const { pin } = await h.games.createGame(h.quiz.id);
    const { playerId } = await h.games.join(pin, "P0");
    await h.games.start(pin);
    for (const payload of [{ x: -0.01, y: 0.5 }, { x: 0.5, y: 1.01 }, { x: 0.5 }]) {
      expect(await h.games.submitAnswer(pin, playerId, 0, payload, h.clock.t + 100)).toEqual({ error: "INVALID" });
    }
  });
});

describe("text", () => {
  // Accepted: Bratislava, BA; tolerance normal.
  it("exact, fuzzy, alias, case / diacritics, wrong, empty and no answer", async () => {
    const played = await playOne(question("text"), [
      { payload: { answers: { answer: "Bratislava" } }, afterMs: 1_000 },
      { payload: { answers: { answer: "Bratslava" } }, afterMs: 2_000 },
      { payload: { answers: { answer: "ba" } }, afterMs: 3_000 },
      { payload: { answers: { answer: "  BRATISLÁVA " } }, afterMs: 4_000 },
      { payload: { answers: { answer: "Košice" } }, afterMs: 5_000 },
      { payload: { answers: { answer: "   " } }, afterMs: 6_000 },
      null,
    ]);
    const hit = { correctness: 1, points: 1000 };
    const miss = { correctness: 0, points: 0 };
    expectScored(played, [hit, hit, hit, hit, miss, miss, null]);
    expect(at(played.playerResults, 1).perField).toEqual({ answer: true });
    expect(at(played.playerResults, 4).perField).toEqual({ answer: false });
    // No answer still gets every field reported as not matched.
    expect(at(played.playerResults, 6).perField).toEqual({ answer: false });
    // Equal scores: lower answeredMs of correct answers ranks first.
    expect(board(played.leaderboard).slice(0, 4)).toEqual([
      ["P0", 1000, 1],
      ["P1", 1000, 2],
      ["P2", 1000, 3],
      ["P3", 1000, 4],
    ]);
  });

  it("strict tolerance rejects what normal accepts", async () => {
    const q = question("text");
    q.data.tolerance = "strict";
    const played = await playOne(q, [{ payload: { answers: { answer: "Bratslav" } } }, { payload: { answers: { answer: "Bratslava" } } }]);
    expectScored(played, [
      { correctness: 0, points: 0 },
      { correctness: 1, points: 1000 },
    ]);
  });
});

describe("music", () => {
  // Fields: artist Metallica (0.5), title One (0.5).
  it("both fields, artist only, title only, neither and no answer", async () => {
    const played = await playOne(question("music"), [
      { payload: { answers: { artist: "metalica", title: "one" } }, afterMs: 1_000 },
      { payload: { answers: { artist: "Metallica", title: "Two" } }, afterMs: 2_000 },
      { payload: { answers: { artist: "Megadeth", title: "One" } }, afterMs: 3_000 },
      { payload: { answers: { artist: "Megadeth", title: "" } }, afterMs: 4_000 },
      null,
    ]);
    expectScored(played, [
      { correctness: 1, points: 1000 },
      { correctness: 0.5, points: 500 },
      { correctness: 0.5, points: 500 },
      { correctness: 0, points: 0 },
      null,
    ]);
    expect(played.playerResults.map((r) => r.perField)).toEqual([
      { artist: true, title: true },
      { artist: true, title: false },
      { artist: false, title: true },
      { artist: false, title: false },
      { artist: false, title: false },
    ]);
    expect(board(played.leaderboard).slice(0, 3)).toEqual([
      ["P0", 1000, 1],
      ["P1", 500, 2],
      ["P2", 500, 3],
    ]);
  });

  it("uneven weights with speed bonus", async () => {
    const q = question("music");
    const [artist, title] = q.data.fields;
    if (!artist || !title) throw new Error("fixture");
    artist.weight = 0.3;
    title.weight = 0.7;
    const played = await playOne(
      q,
      [
        { payload: { answers: { artist: "x", title: "One" } }, afterMs: 0 },
        { payload: { answers: { artist: "Metallica", title: "x" } }, afterMs: 10_000 },
      ],
      { speedBonus: true },
    );
    // 1000 × 0.7 × 1 = 700; 1000 × 0.3 × 0.5 = 150
    expectScored(played, [
      { correctness: 0.7, points: 700 },
      { correctness: 0.3, points: 150 },
    ]);
  });
});

describe("number", () => {
  it("closest with speed bonus: the nearest guesses score by their own time", async () => {
    const played = await playOne(
      numberQuestion({ mode: "closest" }),
      [
        { payload: { value: 2025 }, afterMs: 2_000 },
        { payload: { value: 2027 }, afterMs: 6_000 },
        { payload: { value: 2030 }, afterMs: 1_000 },
        null,
      ],
      { speedBonus: true },
    );
    expectScored(played, [{ correctness: 1, points: 900 }, { correctness: 1, points: 700 }, { correctness: 0, points: 0 }, null]);
    expect(board(played.leaderboard).slice(0, 2)).toEqual([
      ["P0", 900, 1],
      ["P1", 700, 2],
    ]);
  });

  it("tolerance with decimals and negative numbers is exact at the bounds", async () => {
    const played = await playOne(numberQuestion({ answer: -3.5, mode: "tolerance", tolerance: 0.1 }), [
      { payload: { value: -3.4 } },
      { payload: { value: -3.6 } },
      { payload: { value: -3.399 } },
      { payload: { value: 3.5 } },
      null,
    ]);
    expectScored(played, [
      { correctness: 1, points: 1000 },
      { correctness: 1, points: 1000 },
      { correctness: 0, points: 0 },
      { correctness: 0, points: 0 },
      null,
    ]);
  });
});

describe("host override recalculation", () => {
  it("text: accepting a group rescores its players with their original speed and reorders the leaderboard", async () => {
    const h = createHarness({ speedBonus: true }, quizOf([question("text")], { speedBonus: true }));
    const { pin } = await h.games.createGame(h.quiz.id);
    const ids: string[] = [];
    for (const nick of ["Ann", "Ben", "Cid"]) ids.push((await h.games.join(pin, nick)).playerId);
    const [ann, ben, cid] = [at(ids, 0), at(ids, 1), at(ids, 2)];
    await h.games.start(pin);
    const t0 = h.clock.t;
    await h.games.submitAnswer(pin, ann, 0, { answers: { answer: "Pressburg" } }, t0 + 2_000);
    await h.games.submitAnswer(pin, ben, 0, { answers: { answer: "Bratislava" } }, t0 + 8_000);
    await h.games.submitAnswer(pin, cid, 0, { answers: { answer: "PRESSBURG" } }, t0 + 4_000);
    await h.settle(pin);
    await h.games.next(pin); // LEADERBOARD
    expect(board(leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload))[0]).toEqual(["Ben", 600, 1]);

    // The override happens much later; points still use the time of the answer.
    h.clock.t += 60_000;
    h.notifier.clear();
    await h.games.override(pin, { questionIndex: 0, fieldKey: "answer", normalized: "pressburg", accept: true });

    const results = await h.store.getResults(pin, 0);
    expect(results.get(ann)).toMatchObject({ correctness: 1, points: 900, answeredMs: 2_000 });
    expect(results.get(cid)).toMatchObject({ correctness: 1, points: 800, answeredMs: 4_000 });
    expect(results.get(ben)).toMatchObject({ correctness: 1, points: 600, answeredMs: 8_000 });
    const scores = await h.store.getScores(pin);
    expect([scores.get(ann), scores.get(ben), scores.get(cid)]).toEqual([900, 600, 800]);

    // Only the affected players get a new player:result.
    const resent = h.notifier.of("playerResult");
    expect(resent.map((e) => (e.kind === "playerResult" ? e.playerId : "")).sort()).toEqual([ann, cid].sort());
    expect(board(leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload))).toEqual([
      ["Ann", 900, 1],
      ["Cid", 800, 2],
      ["Ben", 600, 3],
    ]);
    const persisted = h.persistence.progress.at(-1);
    expect(persisted?.players.find((p) => p.id === ann)?.score).toBe(900);
    expect(persisted?.answers.find((a) => a.playerId === cid)?.points).toBe(800);
  });

  it("music: overriding one field changes only that field's weight for the affected players", async () => {
    const h = createHarness({ speedBonus: false }, quizOf([question("music")], { speedBonus: false }));
    const { pin } = await h.games.createGame(h.quiz.id);
    const ids: string[] = [];
    for (const nick of ["Ann", "Ben", "Cid"]) ids.push((await h.games.join(pin, nick)).playerId);
    const [ann, ben, cid] = [at(ids, 0), at(ids, 1), at(ids, 2)];
    await h.games.start(pin);
    const t0 = h.clock.t;
    await h.games.submitAnswer(pin, ann, 0, { answers: { artist: "Metallica", title: "One!" } }, t0 + 1_000);
    await h.games.submitAnswer(pin, ben, 0, { answers: { artist: "Metalica", title: "Uno" } }, t0 + 2_000);
    await h.games.submitAnswer(pin, cid, 0, { answers: { artist: "Megadeth", title: "uno" } }, t0 + 3_000);
    await h.settle(pin);
    let results = await h.store.getResults(pin, 0);
    expect([ann, ben, cid].map((id) => results.get(id)?.points)).toEqual([1000, 500, 0]);

    h.notifier.clear();
    await h.games.override(pin, { questionIndex: 0, fieldKey: "title", normalized: "uno", accept: true });
    results = await h.store.getResults(pin, 0);
    expect(results.get(ann)).toMatchObject({ correctness: 1, points: 1000 });
    expect(results.get(ben)).toMatchObject({ correctness: 1, points: 1000, perField: { artist: true, title: true } });
    expect(results.get(cid)).toMatchObject({ correctness: 0.5, points: 500, perField: { artist: false, title: true } });
    const resent = h.notifier.of("playerResult").map((e) => playerResultEventSchema.parse(e.payload));
    expect(resent.map((r) => [r.points, r.totalScore]).sort()).toEqual([
      [1000, 1000],
      [500, 500],
    ]);

    // In REVEAL the host gets an updated reveal; the leaderboard is built from the new totals.
    const reveal = questionRevealEventSchema.parse(h.notifier.last("questionReveal")?.payload);
    const titleGroups = reveal.stats.type === "music" ? reveal.stats.fields.find((f) => f.key === "title")?.groups : [];
    expect(titleGroups?.find((g) => g.normalized === "uno")).toMatchObject({ count: 2, accepted: true, overridden: true });
    await h.games.next(pin);
    expect(board(leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload))).toEqual([
      ["Ann", 1000, 1],
      ["Ben", 1000, 2],
      ["Cid", 500, 3],
    ]);
  });

  it("an override of an earlier question updates the running totals of a later one", async () => {
    const h = createHarness({ speedBonus: false }, quizOf([question("text"), question("single")], { speedBonus: false }));
    const { pin } = await h.games.createGame(h.quiz.id);
    const ann = (await h.games.join(pin, "Ann")).playerId;
    const ben = (await h.games.join(pin, "Ben")).playerId;
    await h.games.start(pin);
    await h.games.submitAnswer(pin, ann, 0, { answers: { answer: "Pozsony" } }, h.clock.t + 1_000);
    await h.games.submitAnswer(pin, ben, 0, { answers: { answer: "Bratislava" } }, h.clock.t + 1_000);
    await h.settle(pin);
    await h.games.next(pin);
    await h.games.next(pin); // question 1
    await h.games.submitAnswer(pin, ann, 1, { optionId: "b" }, h.clock.t + 1_000);
    await h.games.submitAnswer(pin, ben, 1, { optionId: "a" }, h.clock.t + 1_000);
    await h.settle(pin);
    await h.games.next(pin); // LEADERBOARD after question 1
    expect((await h.store.getScores(pin)).get(ann)).toBe(1000);

    await h.games.override(pin, { questionIndex: 0, fieldKey: "answer", normalized: "pozsony", accept: true });
    expect((await h.store.getScores(pin)).get(ann)).toBe(2000);
    const lb = leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload);
    expect(lb.index).toBe(1);
    expect(board(lb)).toEqual([
      ["Ann", 2000, 1],
      ["Ben", 1000, 2],
    ]);
  });
});

/** Every type in one quiz with pages in between: valid answers per type. */
const ALL_TYPES: { type: QuestionType; correct: unknown; partial: unknown | null; wrong: unknown }[] = [
  { type: "single", correct: { optionId: "b" }, partial: null, wrong: { optionId: "c" } },
  { type: "multi", correct: { optionIds: ["a", "c"] }, partial: { optionIds: ["a"] }, wrong: { optionIds: ["b"] } },
  {
    type: "order",
    correct: { order: ["i1", "i2", "i3", "i4"] },
    partial: { order: ["i1", "i2", "i4", "i3"] },
    wrong: { order: ["i4", "i3", "i2", "i1"] },
  },
  { type: "hotspot", correct: { x: 0.55, y: 0.55 }, partial: null, wrong: { x: 0.1, y: 0.9 } },
  { type: "text", correct: { answers: { answer: "BA" } }, partial: null, wrong: { answers: { answer: "Praha" } } },
  {
    type: "music",
    correct: { answers: { artist: "Metallica", title: "One" } },
    partial: { answers: { artist: "Metallica", title: "Fuel" } },
    wrong: { answers: { artist: "ABBA", title: "SOS" } },
  },
  { type: "number", correct: { value: 2026 }, partial: null, wrong: { value: 1990 } },
];

describe("whole game over every question type", () => {
  /** page, single, multi, page, order, hotspot, text, music, number, page */
  function fullQuiz(): Quiz {
    const qs = ALL_TYPES.map((t) => question(t.type));
    const page = (n: number) => samplePage(`bbbbbbbb-0000-4000-8000-00000000001${n}`);
    return quizOf([page(0), ...qs.slice(0, 2), page(1), ...qs.slice(2), page(2)], { speedBonus: false });
  }

  it("scores correct / partial / wrong / no answer per type, skips pages and ranks the totals", async () => {
    const h = createHarness({ speedBonus: false }, fullQuiz());
    const { pin, gameId } = await h.games.createGame(h.quiz.id);
    const nicks = ["Correct", "Partial", "Wrong", "Silent"];
    const ids: string[] = [];
    for (const nick of nicks) ids.push((await h.games.join(pin, nick)).playerId);
    await h.games.start(pin);
    expect((await h.games.attachHost(pin)).state).toBe("PAGE");

    const questionIndexes: number[] = [];
    for (const t of ALL_TYPES) {
      // Advance to the next question (through pages and leaderboards).
      for (;;) {
        const s = await h.games.attachHost(pin);
        if (s.state === "QUESTION") break;
        await h.games.next(pin);
      }
      const index = (await h.games.attachHost(pin)).currentIndex;
      questionIndexes.push(index);
      // Correct answers fastest, so equal totals are ordered predictably.
      const t0 = h.clock.t;
      expect(await h.games.submitAnswer(pin, at(ids, 0), index, t.correct, t0 + 1_000)).toEqual({ ok: true });
      expect(await h.games.submitAnswer(pin, at(ids, 1), index, t.partial ?? t.correct, t0 + 2_000)).toEqual({ ok: true });
      expect(await h.games.submitAnswer(pin, at(ids, 2), index, t.wrong, t0 + 3_000)).toEqual({ ok: true });
      await h.games.endQuestion(pin);
    }
    expect(questionIndexes).toEqual([1, 2, 4, 5, 6, 7, 8]);

    // Pages have no results.
    for (const pageIndex of [0, 3, 9]) expect((await h.store.getResults(pin, pageIndex)).size).toBe(0);

    const points = await Promise.all(
      questionIndexes.map(async (i) => {
        const r = await h.store.getResults(pin, i);
        return ids.map((id) => r.get(id)?.points ?? null);
      }),
    );
    // single, multi, order, hotspot, text, music, number
    expect(points).toEqual([
      [1000, 1000, 0, null],
      [1000, 500, 0, null],
      [1000, 667, 0, null],
      [1000, 1000, 0, null],
      [1000, 1000, 0, null],
      [1000, 500, 0, null],
      // `number` closest: the partial player repeated the exact hit → both score.
      [1000, 1000, 0, null],
    ]);

    await h.games.next(pin); // LEADERBOARD after the last question
    await h.games.next(pin); // last page
    expect((await h.games.attachHost(pin)).state).toBe("PAGE");
    await h.games.next(pin);
    expect((await h.games.attachHost(pin)).state).toBe("FINISHED");

    const finished = gameFinishedEventSchema.parse(h.notifier.last("gameFinished")?.payload);
    expect(finished.ranking.slice(0, 2).map((r) => [r.nickname, r.score, r.rank])).toEqual([
      ["Correct", 7000, 1],
      ["Partial", 5667, 2],
    ]);
    // Wrong and Silent are fully tied (0 points, no correct answers) and share rank 3.
    expect(finished.ranking.slice(2).map((r) => [r.score, r.rank])).toEqual([
      [0, 3],
      [0, 3],
    ]);
    expect(finished.ranking.slice(2).map((r) => r.nickname).sort()).toEqual(["Silent", "Wrong"]);
    expect(finished.podium.map((r) => r.nickname).slice(0, 2)).toEqual(["Correct", "Partial"]);

    // Persistence: one progress entry per question (none for pages), final scores and ranks.
    expect(h.persistence.progress.map((p) => p.answers[0]?.questionIndex)).toEqual(questionIndexes);
    expect(h.persistence.progress.every((p) => p.gameId === gameId && p.answers.length === 3)).toBe(true);
    const final = h.persistence.finished[0]?.players ?? [];
    expect(Object.fromEntries(final.map((p) => [p.nickname, [p.score, p.finalRank]]))).toEqual({
      Correct: [7000, 1],
      Partial: [5667, 2],
      Wrong: [0, 3],
      Silent: [0, 3],
    });
  });
});

describe("answer rejection for every question type", () => {
  const quiz = (): Quiz => quizOf(ALL_TYPES.map((t) => question(t.type)), { speedBonus: false });

  it.each(ALL_TYPES.map((t, i) => [t.type, i, t] as const))(
    "%s: duplicate → ALREADY_ANSWERED, next index → INVALID, previous index / late → LATE; the first answer is scored",
    async (_type, index, t) => {
      const h = createHarness({ speedBonus: false }, quiz());
      const { pin } = await h.games.createGame(h.quiz.id);
      const ann = (await h.games.join(pin, "Ann")).playerId;
      const ben = (await h.games.join(pin, "Ben")).playerId;
      const cid = (await h.games.join(pin, "Cid")).playerId;
      await h.games.start(pin);
      for (;;) {
        const s = await h.games.attachHost(pin);
        if (s.state === "QUESTION" && s.currentIndex === index) break;
        if (s.state === "QUESTION") await h.games.endQuestion(pin);
        else await h.games.next(pin);
      }
      const t0 = h.clock.t;
      expect(await h.games.submitAnswer(pin, ann, index, t.correct, t0 + 1_000)).toEqual({ ok: true });
      expect(await h.games.submitAnswer(pin, ann, index, t.wrong, t0 + 1_500)).toEqual({ error: "ALREADY_ANSWERED" });
      expect(await h.games.submitAnswer(pin, ben, index + 1, t.correct, t0 + 1_500)).toEqual({ error: "INVALID" });
      if (index > 0) {
        expect(await h.games.submitAnswer(pin, ben, index - 1, t.correct, t0 + 1_500)).toEqual({ error: "LATE" });
      }
      expect(await h.games.submitAnswer(pin, ben, index, t.correct, t0 + 10_000 + ANSWER_GRACE_MS + 1)).toEqual({
        error: "LATE",
      });
      expect(await h.games.submitAnswer(pin, cid, index, t.wrong, t0 + 10_000 + ANSWER_GRACE_MS)).toEqual({ ok: true });

      await h.games.endQuestion(pin);
      const results = await h.store.getResults(pin, index);
      expect(results.get(ann)).toMatchObject({ correctness: 1, points: 1000 });
      expect(results.has(ben)).toBe(false);
      expect(results.get(cid)).toMatchObject({ points: 0 });
      // After the question ended, the rejected player cannot answer any more.
      expect(await h.games.submitAnswer(pin, ben, index, t.correct, h.clock.t)).toEqual({ error: "LATE" });
      expect((await h.store.getScores(pin)).get(ben)).toBe(0);
    },
  );
});
