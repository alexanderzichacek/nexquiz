import {
  hostGameStateSchema,
  playerGameStateSchema,
  questionStartEventSchema,
  type Question,
} from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import { createHarness, numberQuestion, sampleQuiz } from "../test/helpers.js";
import { buildQuestionStart, forPlayers } from "./sanitize.js";
import { presentationOrder, shuffleNotIdentity } from "./shuffle.js";

const SECRET_KEYS = ["correctId", "correctIds", "targets", "accepted", "scoring", "tolerance"];

/** All object keys anywhere in a JSON value. */
function allKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) value.forEach((v) => allKeys(v, out));
  else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      out.add(k);
      allKeys(v, out);
    }
  }
  return out;
}

function secretsIn(value: unknown): string[] {
  const keys = allKeys(JSON.parse(JSON.stringify(value)));
  return SECRET_KEYS.filter((k) => keys.has(k));
}

const questions = sampleQuiz().questions;

describe("buildQuestionStart (sanitizer)", () => {
  it.each(questions.map((q) => [q.type, q] as const))("never leaks secrets for %s", (_type, question) => {
    const order = presentationOrder(question, true, (n) => Math.floor(Math.random() * n));
    const event = buildQuestionStart({ question, index: 0, total: 6, number: 1, count: 6, order, deadline: 2, serverNow: 1 });
    expect(secretsIn(event)).toEqual([]);
    expect(questionStartEventSchema.parse(event)).toEqual(event);
    // No alias text either.
    const json = JSON.stringify(event);
    if (question.type === "text") expect(json).not.toContain("Bratislava");
    if (question.type === "music") {
      expect(json).not.toContain("Metallica");
      expect(event).toMatchObject({ clip: { start: 10, duration: 20 } });
    }
  });

  it("strips unknown keys even when the question carries extra data", () => {
    const base = questions[0];
    if (base?.type !== "single") throw new Error("fixture");
    const polluted = {
      ...base,
      secret: "x",
      data: { ...base.data, correctIds: ["b"], extra: 1 },
      media: { imageId: "11111111-1111-4111-8111-111111111111", leak: true },
    } as Question;
    const event = buildQuestionStart({ question: polluted, index: 0, total: 1, number: 1, count: 6, order: null, deadline: 2, serverNow: 1 });
    expect(secretsIn(event)).toEqual([]);
    expect(Object.keys(event).sort()).toEqual(
      ["count", "deadline", "index", "media", "number", "options", "prompt", "serverNow", "timeLimit", "total", "type"].sort(),
    );
    expect(event.media).toEqual({ imageId: "11111111-1111-4111-8111-111111111111" });
  });

  it("sends the mode and tolerance of a number question as a hint, never its correct number", () => {
    const question = numberQuestion({ answer: 31_337, mode: "tolerance", tolerance: 5 });
    const event = buildQuestionStart({ question, index: 0, total: 1, number: 1, count: 1, order: null, deadline: 2, serverNow: 1 });
    expect(event).toMatchObject({ type: "number", mode: "tolerance", tolerance: 5 });
    expect(Object.keys(event)).not.toContain("answer");
    expect(JSON.stringify(event)).not.toContain("31337");
    expect(JSON.stringify(forPlayers(event))).not.toContain("31337");
  });

  it("never sends the audio id of a music question to players", () => {
    const music = questions[5];
    if (music?.type !== "music" || music.media?.audioId === undefined) throw new Error("fixture");
    const host = buildQuestionStart({ question: music, index: 5, total: 6, number: 1, count: 6, order: null, deadline: 2, serverNow: 1 });
    expect(host.media.audioId).toBe(music.media.audioId);
    const player = forPlayers(host);
    expect(player.media).toEqual({});
    expect(JSON.stringify(player)).not.toContain(music.media.audioId);
    // Images stay (hotspot is answered on the phone).
    const withImage = forPlayers({ ...host, media: { imageId: "11111111-1111-4111-8111-111111111111", audioId: music.media.audioId } });
    expect(withImage.media).toEqual({ imageId: "11111111-1111-4111-8111-111111111111" });
    expect(forPlayers(null)).toBeNull();
  });

  it("sends the clip of a text question with audio, and the audio id to the host only", () => {
    const text = questions[4];
    if (text?.type !== "text") throw new Error("fixture");
    const audioId = "33333333-3333-4333-8333-333333333333";
    const lyrics: Question = { ...text, media: { audioId }, data: { ...text.data, clip: { start: 40, duration: 12 } } };
    const host = buildQuestionStart({ question: lyrics, index: 4, total: 6, number: 1, count: 6, order: null, deadline: 2, serverNow: 1 });
    expect(host.media.audioId).toBe(audioId);
    expect(host).toMatchObject({ type: "text", clip: { start: 40, duration: 12 } });
    expect(secretsIn(host)).toEqual([]);
    expect(JSON.stringify(host)).not.toContain("Bratislava");
    const player = forPlayers(host);
    expect(player.media).toEqual({});
    expect(JSON.stringify(player)).not.toContain(audioId);
    // The clip tells the phone there is something to listen to.
    expect(player).toMatchObject({ clip: { start: 40, duration: 12 } });
    // A text question without audio carries no clip.
    const plain = buildQuestionStart({ question: text, index: 4, total: 6, number: 1, count: 6, order: null, deadline: 2, serverNow: 1 });
    expect("clip" in plain).toBe(false);
  });

  it("sends the video id to the host and the players", () => {
    const single = questions[0];
    if (!single) throw new Error("fixture");
    const videoId = "22222222-2222-4222-8222-222222222222";
    const host = buildQuestionStart({
      question: { ...single, media: { videoId } },
      index: 0,
      total: 6,
      number: 1,
      count: 6,
      order: null,
      deadline: 2,
      serverNow: 1,
    });
    expect(host.media).toEqual({ videoId });
    // Played on the phone only when the player turned sound and video on.
    expect(forPlayers(host).media).toEqual({ videoId });
  });

  it("only exposes key, label and weight of text fields", () => {
    const music = questions[5];
    if (music?.type !== "music") throw new Error("fixture");
    const event = buildQuestionStart({ question: music, index: 5, total: 6, number: 1, count: 6, order: null, deadline: 2, serverNow: 1 });
    expect(event.type === "music" && event.fields).toEqual([
      { key: "artist", label: "Interpret", weight: 0.5 },
      { key: "title", label: "Názov skladby", weight: 0.5 },
    ]);
  });

  it("never sends order items in the correct order", () => {
    const order = questions[2];
    if (order?.type !== "order") throw new Error("fixture");
    const correct = order.data.items.map((i) => i.id);
    for (let run = 0; run < 200; run++) {
      const ids = presentationOrder(order, false, (n) => Math.floor(Math.random() * n));
      const event = buildQuestionStart({ question: order, index: 2, total: 6, number: 1, count: 6, order: ids, deadline: 2, serverNow: 1 });
      expect(event.type === "order" && event.items.map((i) => i.id)).not.toEqual(correct);
    }
    // Even without a stored shuffle.
    const fallback = buildQuestionStart({ question: order, index: 2, total: 6, number: 1, count: 6, order: null, deadline: 2, serverNow: 1 });
    expect(fallback.type === "order" && fallback.items.map((i) => i.id)).not.toEqual(correct);
  });

  it("rotates an identity shuffle", () => {
    // random always returns the last index → Fisher–Yates keeps the order.
    expect(shuffleNotIdentity(["a", "b", "c"], (n) => n - 1)).toEqual(["b", "c", "a"]);
  });

  it("keeps the authored option order unless shuffleOptions is on", () => {
    const single = questions[0];
    if (single?.type !== "single") throw new Error("fixture");
    expect(presentationOrder(single, false, () => 0)).toBeNull();
    expect(presentationOrder(single, true, () => 0)?.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("game state snapshots do not leak secrets", () => {
  it("host and player states during every question", async () => {
    const h = createHarness({ shuffleOptions: true });
    const { pin } = await h.games.createGame(h.quiz.id);
    const { playerId } = await h.games.join(pin, "Alice");
    await h.games.start(pin);
    for (let i = 0; i < h.quiz.questions.length; i++) {
      const host = hostGameStateSchema.parse(await h.games.attachHost(pin));
      const player = playerGameStateSchema.parse(await h.games.getPlayerState(pin, playerId));
      expect(host.state).toBe("QUESTION");
      expect(secretsIn(host)).toEqual([]);
      expect(secretsIn(player)).toEqual([]);
      const started = h.notifier.last("questionStart")?.payload;
      expect(secretsIn(started)).toEqual([]);
      const toPlayers = questionStartEventSchema.parse(h.notifier.last("questionStartPlayers")?.payload);
      expect(secretsIn(toPlayers)).toEqual([]);
      // Audio only on the host screen: its file tags would reveal a music answer.
      expect(toPlayers.media.audioId).toBeUndefined();
      expect(player.question?.media.audioId).toBeUndefined();
      if (h.quiz.questions[i]?.type === "music") expect(host.question?.media.audioId).toBeDefined();
      await h.games.endQuestion(pin);
      await h.games.next(pin);
      if (i < h.quiz.questions.length - 1) await h.games.next(pin);
    }
  });
});
