import {
  ANSWER_GRACE_MS,
  DEFAULT_AVATAR,
  GAME_STATES,
  leaderboardEventSchema,
  normalize,
  pageShowEventSchema,
  playerResultEventSchema,
  questionRevealEventSchema,
  questionStartEventSchema,
  type GameStateName,
  type Quiz,
  type QuizSettings,
} from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import { AppError } from "../errors.js";
import {
  AUDIO_ID,
  createHarness,
  numberQuestion,
  PAGE_ID,
  Q,
  sampleQuiz,
  samplePage,
  type Harness,
  type SampleQuiz,
} from "../test/helpers.js";
import { GameService } from "./GameService.js";
import { canTransition, TRANSITIONS } from "./stateMachine.js";

/** Array element that must exist (keeps `noUncheckedIndexedAccess` happy without `!`). */
function at<T>(items: readonly T[], index: number): T {
  const item = items[index];
  if (item === undefined) throw new Error(`missing item ${index}`);
  return item;
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await expect(promise).rejects.toSatisfy((err: unknown) => err instanceof AppError && err.code === code);
}

async function setup(h: Harness, nicknames: string[] = ["Alice", "Bob"]) {
  const { pin, gameId } = await h.games.createGame(h.quiz.id);
  const players: { playerId: string; token: string }[] = [];
  for (const nick of nicknames) players.push(await h.games.join(pin, nick));
  return { pin, gameId, players };
}

async function state(h: Harness, pin: string): Promise<GameStateName> {
  return (await h.games.attachHost(pin)).state;
}

/** Moves a started game to the question with `index` (reveal + next as needed). */
async function goToQuestion(h: Harness, pin: string, index: number): Promise<void> {
  for (;;) {
    const s = await h.games.attachHost(pin);
    if (s.state === "QUESTION" && s.currentIndex === index) return;
    if (s.state === "QUESTION") await h.games.endQuestion(pin);
    else await h.games.next(pin);
  }
}

describe("state machine table", () => {
  it("matches LOGIC.md exactly", () => {
    const allowed = GAME_STATES.flatMap((from) => GAME_STATES.filter((to) => canTransition(from, to)).map((to) => `${from}→${to}`));
    expect(allowed.sort()).toEqual(
      [
        "LOBBY→QUESTION",
        "LOBBY→PAGE",
        "LOBBY→FINISHED",
        "QUESTION→REVEAL",
        "QUESTION→FINISHED",
        "REVEAL→LEADERBOARD",
        "REVEAL→QUESTION",
        "REVEAL→PAGE",
        "REVEAL→FINISHED",
        "LEADERBOARD→QUESTION",
        "LEADERBOARD→PAGE",
        "LEADERBOARD→FINISHED",
        "PAGE→QUESTION",
        "PAGE→PAGE",
        "PAGE→FINISHED",
      ].sort(),
    );
    expect(TRANSITIONS.FINISHED).toEqual([]);
  });
});

describe("GameService transitions", () => {
  it("runs a whole game with leaderboards after each question", async () => {
    const h = createHarness();
    const { pin, gameId } = await setup(h);
    expect(await state(h, pin)).toBe("LOBBY");
    expect(await h.games.gameExists(pin)).toBe(true);

    await h.games.start(pin);
    expect(await state(h, pin)).toBe("QUESTION");
    expect(h.persistence.started).toEqual([gameId]);
    const start = questionStartEventSchema.parse(h.notifier.last("questionStart")?.payload);
    expect(start.index).toBe(0);
    expect(start.total).toBe(6);
    expect(start.deadline - start.serverNow).toBe(10_000);
    expect(h.scheduler.timers.get(pin)?.delayMs).toBe(10_000 + ANSWER_GRACE_MS);

    const total = h.quiz.questions.length;
    for (let i = 0; i < total; i++) {
      await h.games.endQuestion(pin);
      expect(await state(h, pin)).toBe("REVEAL");
      expect(h.scheduler.timers.has(pin)).toBe(false);
      await h.games.next(pin);
      expect(await state(h, pin)).toBe("LEADERBOARD");
      await h.games.next(pin);
      expect(await state(h, pin)).toBe(i === total - 1 ? "FINISHED" : "QUESTION");
    }

    expect(h.persistence.progress).toHaveLength(total);
    expect(h.persistence.finished).toHaveLength(1);
    expect(h.persistence.finished[0]?.players.every((p) => p.finalRank !== undefined)).toBe(true);
    expect(h.notifier.of("gameFinished")).toHaveLength(1);
    // PIN is released at FINISHED.
    expect(await h.store.getPinGameId(pin)).toBeNull();
    expect(await h.games.gameExists(pin)).toBe(false);
  });

  it("skips the leaderboard when showLeaderboardAfterEach is off", async () => {
    const h = createHarness({ showLeaderboardAfterEach: false });
    const { pin } = await setup(h);
    await h.games.start(pin);
    await h.games.endQuestion(pin);
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("QUESTION");

    await goToQuestion(h, pin, 5);
    await h.games.endQuestion(pin);
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("FINISHED");
  });

  it("ends from LOBBY and from QUESTION with host:end", async () => {
    const h = createHarness();
    const a = await setup(h);
    await h.games.end(a.pin);
    expect(await state(h, a.pin)).toBe("FINISHED");

    const b = await setup(h);
    await h.games.start(b.pin);
    await h.games.end(b.pin);
    expect(await state(h, b.pin)).toBe("FINISHED");
    expect(h.scheduler.timers.has(b.pin)).toBe(false);
  });

  it("rejects invalid transitions", async () => {
    const h = createHarness();
    const { pin } = await setup(h);
    await expectCode(h.games.next(pin), "INVALID_TRANSITION");
    await expectCode(h.games.endQuestion(pin), "INVALID_TRANSITION");

    await h.games.start(pin);
    await expectCode(h.games.start(pin), "INVALID_TRANSITION");
    await expectCode(h.games.next(pin), "INVALID_TRANSITION");

    await h.games.endQuestion(pin);
    await expectCode(h.games.endQuestion(pin), "INVALID_TRANSITION");
    await expectCode(h.games.start(pin), "INVALID_TRANSITION");

    await h.games.next(pin); // LEADERBOARD
    await expectCode(h.games.endQuestion(pin), "INVALID_TRANSITION");
    await expectCode(h.games.start(pin), "INVALID_TRANSITION");
  });

  it("ends from REVEAL and LEADERBOARD with host:end", async () => {
    const h = createHarness();
    const a = await setup(h);
    await h.games.start(a.pin);
    await h.games.endQuestion(a.pin);
    await h.games.end(a.pin);
    expect(await state(h, a.pin)).toBe("FINISHED");

    const b = await setup(h);
    await h.games.start(b.pin);
    await h.games.endQuestion(b.pin);
    await h.games.next(b.pin);
    await h.games.end(b.pin);
    expect(await state(h, b.pin)).toBe("FINISHED");
  });

  it("rejects everything after FINISHED", async () => {
    const h = createHarness();
    const { pin } = await setup(h);
    await h.games.end(pin);
    await expectCode(h.games.start(pin), "INVALID_TRANSITION");
    await expectCode(h.games.next(pin), "INVALID_TRANSITION");
    await expectCode(h.games.end(pin), "INVALID_TRANSITION");
    await expectCode(h.games.join(pin, "Late"), "GAME_FINISHED");
  });

  it("does not start without players", async () => {
    const h = createHarness();
    const { pin } = await setup(h, []);
    await expectCode(h.games.start(pin), "INVALID");
  });

  it("ends the question on the deadline timer", async () => {
    const h = createHarness();
    const { pin } = await setup(h);
    await h.games.start(pin);
    h.scheduler.fire(pin);
    await h.settle(pin);
    expect(await state(h, pin)).toBe("REVEAL");
  });

  it("ignores a stale timer of a previous question", async () => {
    const h = createHarness();
    const { pin } = await setup(h);
    await h.games.start(pin);
    const stale = h.scheduler.timers.get(pin);
    await h.games.endQuestion(pin);
    await h.games.next(pin);
    await h.games.next(pin); // QUESTION 1
    stale?.fn();
    await h.settle(pin);
    const s = await h.games.attachHost(pin);
    expect(s.state).toBe("QUESTION");
    expect(s.currentIndex).toBe(1);
  });

  it("restores question timers from the stored deadline", async () => {
    const h = createHarness();
    const { pin } = await setup(h);
    await h.games.start(pin);
    h.clock.t += 4_000;

    // A fresh service over the same store = api restart.
    const restarted = new GameService({
      store: h.store,
      persistence: h.persistence,
      quizzes: { loadForSnapshot: async () => null },
      notifier: h.notifier,
      scheduler: h.scheduler,
      log: { info: () => undefined, warn: () => undefined, error: () => undefined },
      now: () => h.clock.t,
    });
    h.scheduler.cancelAll();
    expect([...(await h.store.getPlayers(pin)).values()].every((p) => p.connected)).toBe(true);
    expect(await restarted.restoreTimers()).toBe(1);
    // No socket survives a restart: everybody is disconnected until player:rejoin.
    expect([...(await h.store.getPlayers(pin)).values()].some((p) => p.connected)).toBe(false);
    expect(h.scheduler.timers.get(pin)?.delayMs).toBe(6_000 + ANSWER_GRACE_MS);
    h.scheduler.fire(pin);
    await restarted.attachHost(pin);
    expect((await restarted.attachHost(pin)).state).toBe("REVEAL");
  });
});

/** `quiz` with the points of one question changed (the sample questions are worth 1 point). */
function withPoints(quiz: SampleQuiz, index: number, points: number): SampleQuiz {
  return { ...quiz, questions: quiz.questions.map((q, i) => (i === index ? { ...q, points } : q)) };
}

const PAGE_2_ID = "bbbbbbbb-0000-4000-8000-000000000002";

/** single (0), page (1), multi (2), page (3). */
function pagedQuiz(settings: Partial<QuizSettings> = {}, first: "question" | "page" = "question"): Quiz {
  const quiz = sampleQuiz(settings);
  const [single, multi] = quiz.questions;
  if (!single || !multi) throw new Error("fixture");
  const body = [single, samplePage(PAGE_ID), multi, samplePage(PAGE_2_ID)];
  return { ...quiz, questions: first === "page" ? [samplePage(PAGE_2_ID), ...body.slice(0, 3)] : body };
}

describe("pages between questions", () => {
  it("shows a page after the leaderboard and numbers only the questions", async () => {
    const h = createHarness({}, pagedQuiz());
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    const first = questionStartEventSchema.parse(h.notifier.last("questionStart")?.payload);
    expect(first).toMatchObject({ index: 0, total: 4, number: 1, count: 2 });

    await h.games.endQuestion(pin);
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("LEADERBOARD");
    expect(leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload)).toMatchObject({ index: 0, number: 1 });

    await h.games.next(pin);
    expect(await state(h, pin)).toBe("PAGE");
    const page = pageShowEventSchema.parse(h.notifier.last("pageShow")?.payload);
    expect(page).toEqual({
      index: 1,
      title: "Category: Sport",
      description: "Next come the sport questions.",
      media: { imageId: "11111111-1111-4111-8111-111111111111" },
    });
    // No timer, and the snapshots of both roles carry the page instead of a question.
    expect(h.scheduler.timers.has(pin)).toBe(false);
    const host = await h.games.attachHost(pin);
    expect(host).toMatchObject({ state: "PAGE", currentIndex: 1, question: null, page });
    const player = await h.games.getPlayerState(pin, at(players, 0).playerId);
    expect(player).toMatchObject({ state: "PAGE", question: null, page, hasAnswered: false, result: null });

    await h.games.next(pin);
    expect(await state(h, pin)).toBe("QUESTION");
    const second = questionStartEventSchema.parse(h.notifier.last("questionStart")?.payload);
    expect(second).toMatchObject({ index: 2, total: 4, number: 2, count: 2 });

    await h.games.endQuestion(pin);
    await h.games.next(pin);
    expect(leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload)).toMatchObject({ index: 2, number: 2 });
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("PAGE");
    expect(h.notifier.of("pageShow")).toHaveLength(2);

    // A page can be the last item.
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("FINISHED");
    // Pages are neither scored nor persisted.
    expect(h.persistence.progress).toHaveLength(2);
    expect(h.persistence.finished).toHaveLength(1);
  });

  it("can start with a page and marks the game as started", async () => {
    const h = createHarness({}, pagedQuiz({}, "page"));
    const { pin, gameId } = await setup(h);
    await h.games.start(pin);
    expect(await state(h, pin)).toBe("PAGE");
    expect(h.persistence.started).toEqual([gameId]);
    expect(h.notifier.of("questionStart")).toHaveLength(0);

    await h.games.next(pin);
    expect(await state(h, pin)).toBe("QUESTION");
    expect(questionStartEventSchema.parse(h.notifier.last("questionStart")?.payload)).toMatchObject({
      index: 1,
      number: 1,
      count: 2,
    });
  });

  it("goes from the reveal straight to a page when the leaderboard is off", async () => {
    const h = createHarness({ showLeaderboardAfterEach: false }, pagedQuiz({ showLeaderboardAfterEach: false }));
    const { pin } = await setup(h);
    await h.games.start(pin);
    await h.games.endQuestion(pin);
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("PAGE");
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("QUESTION");
  });

  it("keeps the scores through a page", async () => {
    const h = createHarness({}, pagedQuiz());
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    h.clock.t += 1_000;
    expect(await h.games.submitAnswer(pin, at(players, 0).playerId, 0, { optionId: "b" }, h.clock.t)).toEqual({ ok: true });
    await h.games.endQuestion(pin);
    const score = (await h.games.getPlayerState(pin, at(players, 0).playerId)).score;
    expect(score).toBeGreaterThan(0);
    await h.games.next(pin);
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("PAGE");
    expect((await h.games.getPlayerState(pin, at(players, 0).playerId)).score).toBe(score);
  });

  it("accepts no answer and no end_question on a page, but host:end", async () => {
    const h = createHarness({ showLeaderboardAfterEach: false }, pagedQuiz({ showLeaderboardAfterEach: false }));
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    await h.games.endQuestion(pin);
    await h.games.next(pin);
    expect(await state(h, pin)).toBe("PAGE");

    const now = h.clock.t;
    expect(await h.games.submitAnswer(pin, at(players, 0).playerId, 1, { optionId: "a" }, now)).toEqual({ error: "LATE" });
    await expectCode(h.games.endQuestion(pin), "INVALID_TRANSITION");
    await expectCode(h.games.start(pin), "INVALID_TRANSITION");

    await h.games.end(pin);
    expect(await state(h, pin)).toBe("FINISHED");
  });

  it("refuses a quiz that has pages only", async () => {
    const h = createHarness({}, { ...sampleQuiz(), questions: [samplePage()] });
    await expectCode(h.games.createGame(h.quiz.id), "INVALID");
  });
});

describe("answers", () => {
  it("accepts an answer and rejects a duplicate (HSETNX)", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    const alice = at(players, 0);
    await h.games.start(pin);
    expect(await h.games.submitAnswer(pin, alice.playerId, 0, { optionId: "b" }, h.clock.t + 1000)).toEqual({ ok: true });
    expect(await h.games.submitAnswer(pin, alice.playerId, 0, { optionId: "a" }, h.clock.t + 2000)).toEqual({
      error: "ALREADY_ANSWERED",
    });
    const stored = await h.store.getAnswers(pin, 0);
    expect(stored.get(alice.playerId)?.payload).toEqual({ optionId: "b" });
  });

  it("rejects a late answer after deadline + grace", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    const deadline = h.clock.t + 10_000;
    expect(await h.games.submitAnswer(pin, at(players, 0).playerId, 0, { optionId: "b" }, deadline + ANSWER_GRACE_MS)).toEqual({
      ok: true,
    });
    expect(
      await h.games.submitAnswer(pin, at(players, 1).playerId, 0, { optionId: "b" }, deadline + ANSWER_GRACE_MS + 1),
    ).toEqual({ error: "LATE" });
  });

  it("rejects answers after the question ended", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    await h.games.endQuestion(pin);
    expect(await h.games.submitAnswer(pin, at(players, 0).playerId, 0, { optionId: "b" }, h.clock.t)).toEqual({ error: "LATE" });
  });

  it("rejects a wrong question index", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    const id = at(players, 0).playerId;
    expect(await h.games.submitAnswer(pin, id, 0, { optionId: "b" }, h.clock.t)).toEqual({ error: "INVALID" });
    await h.games.start(pin);
    expect(await h.games.submitAnswer(pin, id, 1, { optionIds: ["a"] }, h.clock.t)).toEqual({ error: "INVALID" });
    await goToQuestion(h, pin, 1);
    expect(await h.games.submitAnswer(pin, id, 0, { optionId: "b" }, h.clock.t)).toEqual({ error: "LATE" });
  });

  it("validates payloads against the current question", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h, ["Alice"]);
    const id = at(players, 0).playerId;
    const t = () => h.clock.t + 100;
    await h.games.start(pin);
    expect(await h.games.submitAnswer(pin, id, 0, { optionId: "zzz" }, t())).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, id, 0, { optionIds: ["b"] }, t())).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, id, 0, "b", t())).toEqual({ error: "INVALID" });

    await goToQuestion(h, pin, 1);
    expect(await h.games.submitAnswer(pin, id, 1, { optionIds: ["a", "a"] }, t())).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, id, 1, { optionIds: [] }, t())).toEqual({ error: "INVALID" });

    await goToQuestion(h, pin, 2);
    expect(await h.games.submitAnswer(pin, id, 2, { order: ["i1", "i2", "i3"] }, t())).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, id, 2, { order: ["i1", "i1", "i2", "i3"] }, t())).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, id, 2, { order: ["i1", "i2", "i3", "x"] }, t())).toEqual({ error: "INVALID" });

    await goToQuestion(h, pin, 3);
    expect(await h.games.submitAnswer(pin, id, 3, { x: 1.2, y: 0.5 }, t())).toEqual({ error: "INVALID" });

    await goToQuestion(h, pin, 4);
    expect(await h.games.submitAnswer(pin, id, 4, { answers: { answer: "x".repeat(101) } }, t())).toEqual({
      error: "INVALID",
    });
  });

  it("rejects answers from unknown or kicked players", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    expect(await h.games.submitAnswer(pin, "00000000-0000-4000-8000-000000000000", 0, { optionId: "b" }, h.clock.t)).toEqual({
      error: "INVALID",
    });
    await h.games.kick(pin, at(players, 1).playerId);
    expect(await h.games.submitAnswer(pin, at(players, 1).playerId, 0, { optionId: "b" }, h.clock.t)).toEqual({ error: "INVALID" });
  });

  it("ends the question when all connected players answered", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h, ["Alice", "Bob", "Cyril"]);
    await h.games.start(pin);
    await h.games.setConnected(pin, at(players, 2).playerId, false);
    await h.games.submitAnswer(pin, at(players, 0).playerId, 0, { optionId: "b" }, h.clock.t + 10);
    await h.settle(pin);
    expect(await state(h, pin)).toBe("QUESTION");
    await h.games.submitAnswer(pin, at(players, 1).playerId, 0, { optionId: "a" }, h.clock.t + 20);
    await h.settle(pin);
    expect(await state(h, pin)).toBe("REVEAL");
  });

  it("scores on the server with the speed bonus", async () => {
    // 1000 points: a correct answer after half of the time limit is worth 750.
    const h = createHarness({}, withPoints(sampleQuiz(), 0, 1000));
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    const t0 = h.clock.t;
    await h.games.submitAnswer(pin, at(players, 0).playerId, 0, { optionId: "b" }, t0 + 5_000);
    await h.games.submitAnswer(pin, at(players, 1).playerId, 0, { optionId: "a" }, t0 + 1_000);
    await h.settle(pin);
    const results = await h.store.getResults(pin, 0);
    expect(results.get(at(players, 0).playerId)).toEqual({ correctness: 1, points: 750, answeredMs: 5_000 });
    expect(results.get(at(players, 1).playerId)).toEqual({ correctness: 0, points: 0, answeredMs: 1_000 });

    const resultEvents = h.notifier.of("playerResult").map((e) => playerResultEventSchema.parse(e.payload));
    expect(resultEvents).toHaveLength(2);
    expect(resultEvents.find((r) => r.points === 750)?.rank).toBe(1);
    // Correct answer is revealed only after the question.
    expect(resultEvents[0]?.correct).toEqual({ type: "single", correctId: "b" });

    const reveal = questionRevealEventSchema.parse(h.notifier.last("questionReveal")?.payload);
    expect(reveal.stats).toEqual({
      type: "single",
      votes: [
        { optionId: "a", count: 1 },
        { optionId: "b", count: 1 },
        { optionId: "c", count: 0 },
      ],
    });
    expect(h.persistence.progress.at(-1)?.answers).toHaveLength(2);
  });

  it("allows a late join into the running question", async () => {
    const h = createHarness();
    const { pin } = await setup(h, ["Alice"]);
    await h.games.start(pin);
    const late = await h.games.join(pin, "Late");
    const s = await h.games.getPlayerState(pin, late.playerId);
    expect(s.state).toBe("QUESTION");
    expect(s.score).toBe(0);
    expect(s.hasAnswered).toBe(false);
    expect(await h.games.submitAnswer(pin, late.playerId, 0, { optionId: "b" }, h.clock.t + 100)).toEqual({ ok: true });
  });
});

describe("players", () => {
  it("enforces case- and diacritics-insensitive unique nicknames", async () => {
    const h = createHarness();
    const { pin } = await setup(h, ["Ján"]);
    await expectCode(h.games.join(pin, "jan"), "NICK_TAKEN");
    await expectCode(h.games.join(pin, " JÁN "), "NICK_TAKEN");
    await expect(h.games.join(pin, "Jana")).resolves.toMatchObject({ playerId: expect.any(String) });
  });

  it("keeps the chosen avatar in the lobby, player state, leaderboard and ranking", async () => {
    const h = createHarness();
    const { pin } = await h.games.createGame(h.quiz.id);
    const avatar = { body: 3, head: 1, glasses: 2, hat: 0, mustache: null };
    const alice = await h.games.join(pin, "Alice", avatar);
    const bob = await h.games.join(pin, "Bob");

    expect((await h.games.attachHost(pin)).players.map((p) => p.avatar)).toEqual([avatar, DEFAULT_AVATAR]);
    expect((await h.games.getPlayerState(pin, alice.playerId)).avatar).toEqual(avatar);

    await h.games.start(pin);
    await h.games.submitAnswer(pin, alice.playerId, 0, { optionId: "b" }, h.clock.t + 10);
    await h.games.submitAnswer(pin, bob.playerId, 0, { optionId: "a" }, h.clock.t + 20);
    await h.settle(pin);
    await h.games.next(pin);
    const leaderboard = (await h.games.attachHost(pin)).leaderboard;
    expect(leaderboard?.top.find((e) => e.playerId === alice.playerId)?.avatar).toEqual(avatar);

    await h.games.end(pin);
    const finished = (await h.games.getPlayerState(pin, bob.playerId)).finished;
    expect(finished?.ranking.map((r) => r.avatar)).toEqual([avatar, DEFAULT_AVATAR]);
  });

  it("rejects unknown PINs", async () => {
    const h = createHarness();
    await expectCode(h.games.join("999999", "Alice"), "PIN_NOT_FOUND");
    await expectCode(h.games.attachHost("999999"), "PIN_NOT_FOUND");
  });

  it("rejoins with the token and reports hasAnswered", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    const alice = at(players, 0);
    await h.games.start(pin);
    await h.games.setConnected(pin, alice.playerId, false);
    await h.games.submitAnswer(pin, at(players, 1).playerId, 0, { optionId: "b" }, h.clock.t + 10);
    await h.settle(pin);
    // Bob was the only connected player → reveal.
    expect(await state(h, pin)).toBe("REVEAL");

    const s = await h.games.rejoin(pin, alice.token);
    expect(s).toMatchObject({ role: "player", playerId: alice.playerId, nickname: "Alice", state: "REVEAL", hasAnswered: false });
    expect(s.result?.points).toBe(0);
    const bob = await h.games.rejoin(pin, at(players, 1).token);
    expect(bob.hasAnswered).toBe(true);
    expect(bob.rank).toBe(1);

    const host = await h.games.attachHost(pin);
    expect(host.players.find((p) => p.id === alice.playerId)?.connected).toBe(true);
  });

  it("rejects an invalid token", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    await expectCode(h.games.rejoin(pin, `${at(players, 0).playerId}.not-the-secret`), "INVALID_TOKEN");
    await expectCode(h.games.rejoin(pin, "garbage-token-without-id"), "INVALID_TOKEN");
  });

  it("kicks a player and frees the nickname", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    await h.games.kick(pin, at(players, 0).playerId);
    expect(h.notifier.last("playerKicked")).toMatchObject({ playerId: at(players, 0).playerId });
    const host = await h.games.attachHost(pin);
    expect(host.players.map((p) => p.nickname)).toEqual(["Bob"]);
    await expectCode(h.games.rejoin(pin, at(players, 0).token), "INVALID_TOKEN");
    await expect(h.games.join(pin, "alice")).resolves.toBeDefined();
  });
});

describe("player audio clip", () => {
  const MUSIC_INDEX = 5;

  it("gives the clip of the running music question to a player with a valid token", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    await goToQuestion(h, pin, MUSIC_INDEX);
    await expect(h.games.playerClip(pin, at(players, 0).token, MUSIC_INDEX)).resolves.toEqual({
      audioId: AUDIO_ID,
      clip: { start: 10, duration: 20 },
    });
  });

  it("refuses the clip before the question, for another index, after it ended and without audio", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    const token = at(players, 0).token;
    // Lobby: nothing is playing yet, the clip must not be fetched in advance.
    await expectCode(h.games.playerClip(pin, token, MUSIC_INDEX), "NOT_FOUND");
    await h.games.start(pin);
    // A question without audio, and the music question while another one runs.
    await expectCode(h.games.playerClip(pin, token, 0), "NOT_FOUND");
    await expectCode(h.games.playerClip(pin, token, MUSIC_INDEX), "NOT_FOUND");
    await goToQuestion(h, pin, MUSIC_INDEX);
    await expectCode(h.games.playerClip(pin, token, MUSIC_INDEX - 1), "NOT_FOUND");
    await h.games.endQuestion(pin);
    await expectCode(h.games.playerClip(pin, token, MUSIC_INDEX), "NOT_FOUND");
  });

  it("refuses an invalid or kicked player token and an unknown PIN", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    await goToQuestion(h, pin, MUSIC_INDEX);
    await expectCode(h.games.playerClip(pin, `${at(players, 0).playerId}.not-the-secret`, MUSIC_INDEX), "INVALID_TOKEN");
    await expectCode(h.games.playerClip(pin, "garbage-token-without-id", MUSIC_INDEX), "INVALID_TOKEN");
    await h.games.kick(pin, at(players, 1).playerId);
    await expectCode(h.games.playerClip(pin, at(players, 1).token, MUSIC_INDEX), "INVALID_TOKEN");
    await expectCode(h.games.playerClip("999999", at(players, 0).token, MUSIC_INDEX), "PIN_NOT_FOUND");
  });
});

describe("leaderboard", () => {
  it("breaks ties by the sum of answeredMs of correct answers", async () => {
    const h = createHarness({ speedBonus: false });
    const { pin, players } = await setup(h);
    const [alice, bob] = [at(players, 0), at(players, 1)];
    await h.games.start(pin);
    const t0 = h.clock.t;
    await h.games.submitAnswer(pin, alice.playerId, 0, { optionId: "b" }, t0 + 2_000);
    await h.games.submitAnswer(pin, bob.playerId, 0, { optionId: "b" }, t0 + 1_000);
    await h.settle(pin);
    await h.games.next(pin); // LEADERBOARD

    const first = leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload);
    expect(first.top.map((e) => [e.nickname, e.score, e.rank, e.delta, e.rankChange])).toEqual([
      ["Bob", 1, 1, 1, 0],
      ["Alice", 1, 2, 1, 0],
    ]);

    // Question 2: only Alice is correct → she moves up.
    await h.games.next(pin);
    const t1 = h.clock.t;
    await h.games.submitAnswer(pin, alice.playerId, 1, { optionIds: ["a", "c"] }, t1 + 500);
    await h.games.submitAnswer(pin, bob.playerId, 1, { optionIds: ["b", "d"] }, t1 + 500);
    await h.settle(pin);
    await h.games.next(pin);
    const second = leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload);
    expect(second.index).toBe(1);
    expect(second.top.map((e) => [e.nickname, e.score, e.rank, e.delta, e.rankChange])).toEqual([
      ["Alice", 2, 1, 1, 1],
      ["Bob", 1, 2, 0, -1],
    ]);
  });

  it("shows the top 10 only", async () => {
    const nicks = Array.from({ length: 12 }, (_, i) => `P${i}`);
    const h = createHarness();
    const { pin } = await setup(h, nicks);
    await h.games.start(pin);
    await h.games.endQuestion(pin);
    await h.games.next(pin);
    const lb = leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload);
    expect(lb.top).toHaveLength(10);
  });
});

describe("number questions", () => {
  /** Plays one `number` question with the given guesses (all at the same time, so the speed bonus is equal) and returns the points per player. */
  async function play(data: Parameters<typeof numberQuestion>[0], guesses: unknown[]) {
    const quiz: Quiz = { ...sampleQuiz({ speedBonus: false }), questions: [numberQuestion(data)] };
    const h = createHarness({ speedBonus: false }, quiz);
    const { pin, players } = await setup(
      h,
      guesses.map((_, i) => `P${i}`),
    );
    await h.games.start(pin);
    const t0 = h.clock.t;
    for (const [i, value] of guesses.entries()) {
      await h.games.submitAnswer(pin, at(players, i).playerId, 0, { value }, t0 + 1_000);
    }
    await h.settle(pin);
    const results = await h.store.getResults(pin, 0);
    return { h, pin, points: players.map((p) => results.get(p.playerId)?.points ?? 0) };
  }

  it("closest: the nearest guess scores, the rest do not", async () => {
    const { points } = await play({ mode: "closest" }, [2020, 2025, 2031]);
    expect(points).toEqual([0, 1000, 0]);
  });

  it("closest: guesses tied for the nearest distance all score", async () => {
    const { points } = await play({ mode: "closest" }, [2025, 2027, 2030]);
    expect(points).toEqual([1000, 1000, 0]);
  });

  it("closest: an exact hit scores together with other exact hits only", async () => {
    const { points } = await play({ mode: "closest" }, [2026, 2025, 2026]);
    expect(points).toEqual([1000, 0, 1000]);
  });

  it("closest: a player who did not answer does not influence the others", async () => {
    const { points } = await play({ mode: "closest" }, [1900]);
    expect(points).toEqual([1000]);
  });

  it("tolerance: every guess within the tolerance scores, regardless of the others", async () => {
    const { points } = await play({ mode: "tolerance", tolerance: 1 }, [2025, 2026, 2027, 2028, 2000]);
    expect(points).toEqual([1000, 1000, 1000, 0, 0]);
  });

  it("tolerance: nobody scores when nobody is close enough", async () => {
    const { points } = await play({ mode: "tolerance", tolerance: 1 }, [2030, 2010]);
    expect(points).toEqual([0, 0]);
  });

  it("rejects an answer that is not a number within limits", async () => {
    const quiz: Quiz = { ...sampleQuiz(), questions: [numberQuestion()] };
    const h = createHarness({}, quiz);
    const { pin, players } = await setup(h);
    await h.games.start(pin);
    const p = at(players, 0).playerId;
    const t = h.clock.t;
    expect(await h.games.submitAnswer(pin, p, 0, { value: "2026" }, t)).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, p, 0, { value: 1e13 }, t)).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, p, 0, { value: 1.2345 }, t)).toEqual({ error: "INVALID" });
    expect(await h.games.submitAnswer(pin, p, 0, { value: 2025 }, t)).toEqual({ ok: true });
    expect(await h.games.submitAnswer(pin, p, 0, { value: 2026 }, t)).toEqual({ error: "ALREADY_ANSWERED" });
  });

  it("does not leak the correct number before reveal, and reveals it with the guesses sorted by distance", async () => {
    const { h } = await play({ mode: "tolerance", tolerance: 1 }, [2030, 2027, 2027, 2026]);
    const start = questionStartEventSchema.parse(h.notifier.last("questionStart")?.payload);
    expect(start).toMatchObject({ type: "number", mode: "tolerance", tolerance: 1 });
    expect(JSON.stringify(h.notifier.of("questionStart"))).not.toContain("2026");
    expect(JSON.stringify(h.notifier.of("questionStartPlayers"))).not.toContain("2026");

    // Everybody answered, so the question has ended on its own.
    const reveal = questionRevealEventSchema.parse(h.notifier.last("questionReveal")?.payload);
    expect(reveal.correct).toEqual({ type: "number", answer: 2026, mode: "tolerance", tolerance: 1 });
    expect(reveal.stats).toEqual({
      type: "number",
      guesses: [
        { value: 2026, count: 1, hit: true },
        { value: 2027, count: 2, hit: true },
        { value: 2030, count: 1, hit: false },
      ],
    });
    const result = playerResultEventSchema.parse(h.notifier.of("playerResult")[0]?.payload);
    expect(result.correct).toMatchObject({ type: "number", answer: 2026 });
  });
});

describe("host override", () => {
  it("recomputes affected players, scores and the leaderboard", async () => {
    const h = createHarness({ speedBonus: false });
    const { pin, players } = await setup(h, ["Alice", "Bob", "Cyril"]);
    const [alice, bob, cyril] = [at(players, 0), at(players, 1), at(players, 2)];
    await h.games.start(pin);
    await goToQuestion(h, pin, 4); // text question
    const t = h.clock.t;
    await h.games.submitAnswer(pin, alice.playerId, 4, { answers: { answer: "Pressburg" } }, t + 100);
    await h.games.submitAnswer(pin, bob.playerId, 4, { answers: { answer: "  PRESSBURG!" } }, t + 200);
    await h.games.submitAnswer(pin, cyril.playerId, 4, { answers: { answer: "BA" } }, t + 300);
    await h.settle(pin);
    expect(await state(h, pin)).toBe("REVEAL");

    const reveal = questionRevealEventSchema.parse(h.notifier.last("questionReveal")?.payload);
    expect(reveal.stats.type).toBe("text");
    const groups = reveal.stats.type === "text" ? reveal.stats.fields[0]?.groups : [];
    expect(groups).toEqual([
      { normalized: "pressburg", examples: ["Pressburg", "PRESSBURG!"], count: 2, accepted: false, overridden: false },
      { normalized: "ba", examples: ["BA"], count: 1, accepted: true, overridden: false },
    ]);
    expect((await h.store.getResults(pin, 4)).get(alice.playerId)?.points).toBe(0);

    h.notifier.clear();
    await h.games.override(pin, { questionIndex: 4, fieldKey: "answer", normalized: "pressburg", accept: true });

    const results = await h.store.getResults(pin, 4);
    expect(results.get(alice.playerId)).toMatchObject({ correctness: 1, points: 1, perField: { answer: true } });
    expect(results.get(bob.playerId)).toMatchObject({ correctness: 1, points: 1 });
    expect(results.get(cyril.playerId)).toMatchObject({ correctness: 1, points: 1 });

    // player:result re-sent to the affected players only.
    const resent = h.notifier.of("playerResult");
    expect(resent.map((e) => (e.kind === "playerResult" ? e.playerId : "")).sort()).toEqual(
      [alice.playerId, bob.playerId].sort(),
    );
    const aliceResult = playerResultEventSchema.parse(resent.find((e) => e.kind === "playerResult" && e.playerId === alice.playerId)?.payload);
    expect(aliceResult).toMatchObject({ index: 4, correctness: 1, points: 1, totalScore: 1, perField: { answer: true } });

    const updated = questionRevealEventSchema.parse(h.notifier.last("questionReveal")?.payload);
    const updatedGroups = updated.stats.type === "text" ? updated.stats.fields[0]?.groups : [];
    expect(updatedGroups?.[0]).toMatchObject({ normalized: "pressburg", accepted: true, overridden: true });

    const scores = await h.store.getScores(pin);
    expect(scores.get(alice.playerId)).toBe(1);
    expect(h.persistence.progress.at(-1)?.answers.find((a) => a.playerId === alice.playerId)?.points).toBe(1);

    // Leaderboard reflects the recomputed totals; override still possible there.
    await h.games.next(pin);
    let lb = leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload);
    expect(lb.top.every((e) => e.score === 1)).toBe(true);

    h.notifier.clear();
    await h.games.override(pin, { questionIndex: 4, fieldKey: "answer", normalized: "pressburg", accept: false });
    // In LEADERBOARD the host gets the new leaderboard, not a reveal it would jump back to.
    expect(h.notifier.of("questionReveal")).toEqual([]);
    lb = leaderboardEventSchema.parse(h.notifier.last("leaderboard")?.payload);
    expect(lb.top.map((e) => [e.nickname, e.score])[0]).toEqual(["Cyril", 1]);
    expect(lb.top.slice(1).every((e) => e.score === 0 && e.rank === 2)).toBe(true);
  });

  it("overrides one field of a music question", async () => {
    const h = createHarness({ speedBonus: false }, withPoints(sampleQuiz({ speedBonus: false }), 5, 1000));
    const { pin, players } = await setup(h, ["Alice"]);
    const alice = at(players, 0);
    await h.games.start(pin);
    await goToQuestion(h, pin, 5);
    await h.games.submitAnswer(pin, alice.playerId, 5, { answers: { artist: "Metalica", title: "Two" } }, h.clock.t + 1);
    await h.settle(pin);
    expect((await h.store.getResults(pin, 5)).get(alice.playerId)).toMatchObject({
      correctness: 0.5,
      points: 500,
      perField: { artist: true, title: false },
    });
    await h.games.override(pin, { questionIndex: 5, fieldKey: "title", normalized: "two", accept: true });
    expect((await h.store.getResults(pin, 5)).get(alice.playerId)).toMatchObject({ correctness: 1, points: 1000 });
    // Manual reject wins over an automatic match.
    await h.games.override(pin, { questionIndex: 5, fieldKey: "artist", normalized: "metalica", accept: false });
    expect((await h.store.getResults(pin, 5)).get(alice.playerId)).toMatchObject({ correctness: 0.5, points: 500 });
  });

  it("rejects overrides that do not fit the game", async () => {
    const h = createHarness();
    const { pin, players } = await setup(h);
    const payload = { questionIndex: 4, fieldKey: "answer", normalized: "x", accept: true } as const;
    await expectCode(h.games.override(pin, payload), "INVALID"); // lobby
    await h.games.start(pin);
    await expectCode(h.games.override(pin, { ...payload, questionIndex: 0 }), "INVALID"); // question still running
    await h.games.endQuestion(pin);
    await expectCode(h.games.override(pin, { ...payload, questionIndex: 0 }), "INVALID"); // not a text question
    await goToQuestion(h, pin, 4);
    await h.games.submitAnswer(pin, at(players, 0).playerId, 4, { answers: { answer: "X" } }, h.clock.t + 1);
    await h.games.endQuestion(pin);
    await expectCode(h.games.override(pin, { ...payload, fieldKey: "artist" }), "INVALID");
    await expectCode(h.games.override(pin, { ...payload, normalized: "Not Normalized" }), "INVALID");
    await expectCode(h.games.override(pin, { ...payload, normalized: "nobody answered this" }), "INVALID");
    await expect(h.games.override(pin, payload)).resolves.toBeUndefined();
  });

  it("accepts any reveal group key, even when normalize is not idempotent on it", async () => {
    const h = createHarness({ speedBonus: false });
    const { pin, players } = await setup(h, ["Alice"]);
    const alice = at(players, 0);
    await h.games.start(pin);
    await goToQuestion(h, pin, 4);
    await h.games.submitAnswer(pin, alice.playerId, 4, { answers: { answer: "The (live) The Beatles" } }, h.clock.t + 1);
    await h.settle(pin);
    const reveal = questionRevealEventSchema.parse(h.notifier.last("questionReveal")?.payload);
    const key = reveal.stats.type === "text" ? reveal.stats.fields[0]?.groups[0]?.normalized : undefined;
    if (key === undefined) throw new Error("missing reveal group");
    // The motivating case: re-normalizing the group key changes it.
    expect(normalize(key)).not.toBe(key);
    await h.games.override(pin, { questionIndex: 4, fieldKey: "answer", normalized: key, accept: true });
    expect((await h.store.getResults(pin, 4)).get(alice.playerId)).toMatchObject({ correctness: 1, points: 1 });
  });
});

describe("snapshot", () => {
  it("plays from the snapshot, not from live quiz data", async () => {
    const quiz = sampleQuiz();
    const h = createHarness({}, quiz);
    const { pin } = await setup(h);
    const first = quiz.questions[0];
    if (first?.type === "single") first.data.correctId = "a";
    quiz.title = "Changed";
    expect((await h.games.attachHost(pin)).quizTitle).toBe("Test quiz");
    expect(h.persistence.created[0]?.snapshot.questions[0]).toMatchObject({ id: Q.single, data: { correctId: "b" } });
  });

  it("refuses an unknown or empty quiz", async () => {
    const h = createHarness({}, { ...sampleQuiz(), questions: [] });
    await expectCode(h.games.createGame("44444444-4444-4444-8444-444444444444"), "NOT_FOUND");
    await expectCode(h.games.createGame(h.quiz.id), "INVALID");
  });
});
