import { describe, expect, it } from "vitest";
import { isPermutation, parseAnswerPayload } from "./answer.js";
import { avatarSchema, DEFAULT_AVATAR } from "./avatar.js";
import { formatPin, nicknameKey, normalizePinInput, pinSchema } from "./common.js";
import {
  isPage,
  pageSchema,
  questionCount,
  questionNumber,
  quizSchema,
  questionSchema,
  quizSettingsSchema,
  type Question,
} from "./question.js";
import {
  explanationShowEventSchema,
  gameStateSchema,
  pageShowEventSchema,
  playerJoinPayloadSchema,
  questionStartEventSchema,
} from "./ws.js";

const ID = (n: number) => `7f0b6c1e-3c1a-4c55-9a43-0d6f8f6d2a${String(n).padStart(2, "0")}`;
const base = { id: ID(1), prompt: "Otázka?", timeLimit: 30, points: 1 };
const opts = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, text: `Option ${i}` }));

const single = { ...base, type: "single", data: { options: opts(4), correctId: "o1" } };
const multi = { ...base, type: "multi", data: { options: opts(4), correctIds: ["o0", "o2"], scoring: "partial" } };
const order = { ...base, type: "order", data: { items: opts(4), scoring: "partial" } };
const hotspot = {
  ...base,
  type: "hotspot",
  media: { imageId: ID(2) },
  data: { targets: [{ shape: "circle", x: 0.4, y: 0.6, r: 0.05 }] },
};
const text = {
  ...base,
  type: "text",
  data: { fields: [{ key: "answer", weight: 1, accepted: ["Bratislava", "BA"] }], tolerance: "normal" },
};
const music = {
  ...base,
  type: "music",
  media: { audioId: ID(3) },
  data: {
    clip: { start: 45, duration: 15 },
    fields: [
      { key: "artist", label: "Interpret", weight: 0.5, accepted: ["Metallica"] },
      { key: "title", label: "Názov skladby", weight: 0.5, accepted: ["Nothing Else Matters"] },
    ],
    tolerance: "normal",
  },
};

const numberQ = { ...base, type: "number", data: { answer: 2026, mode: "closest", tolerance: 0 } };

const ok = (q: unknown) => questionSchema.safeParse(q).success;
const parse = (q: unknown): Question => questionSchema.parse(q);

describe("questionSchema – valid questions", () => {
  it.each([single, multi, order, hotspot, text, music, numberQ])("accepts a valid $type question", (q) => {
    expect(ok(q)).toBe(true);
  });
});

describe("questionSchema – common limits", () => {
  it("time limit 5–120 s, integer", () => {
    expect(ok({ ...single, timeLimit: 4 })).toBe(false);
    expect(ok({ ...single, timeLimit: 5 })).toBe(true);
    expect(ok({ ...single, timeLimit: 120 })).toBe(true);
    expect(ok({ ...single, timeLimit: 121 })).toBe(false);
    expect(ok({ ...single, timeLimit: 10.5 })).toBe(false);
  });

  it("points with max 2 decimals", () => {
    expect(ok({ ...single, points: 1.25 })).toBe(true);
    expect(ok({ ...single, points: 1.255 })).toBe(false);
    expect(ok({ ...single, points: -1 })).toBe(false);
  });

  it("requires a prompt", () => {
    expect(ok({ ...single, prompt: "   " })).toBe(false);
  });

  it("rejects unknown types", () => {
    expect(ok({ ...single, type: "polygon" })).toBe(false);
  });
});

describe("questionSchema – editor rules", () => {
  it("single: 2–6 options and exactly one correct", () => {
    expect(ok({ ...single, data: { options: opts(1), correctId: "o0" } })).toBe(false);
    expect(ok({ ...single, data: { options: opts(2), correctId: "o0" } })).toBe(true);
    expect(ok({ ...single, data: { options: opts(6), correctId: "o0" } })).toBe(true);
    expect(ok({ ...single, data: { options: opts(7), correctId: "o0" } })).toBe(false);
    expect(ok({ ...single, data: { options: opts(3), correctId: "missing" } })).toBe(false);
  });

  it("choice option ids must be unique", () => {
    const dup = [
      { id: "a", text: "A" },
      { id: "a", text: "B" },
    ];
    expect(ok({ ...single, data: { options: dup, correctId: "a" } })).toBe(false);
  });

  it("multi: ≥ 1 correct, all referencing options", () => {
    expect(ok({ ...multi, data: { ...multi.data, correctIds: [] } })).toBe(false);
    expect(ok({ ...multi, data: { ...multi.data, correctIds: ["o9"] } })).toBe(false);
    expect(ok({ ...multi, data: { ...multi.data, correctIds: ["o0", "o0"] } })).toBe(false);
    expect(ok({ ...multi, data: { ...multi.data, scoring: "some" } })).toBe(false);
  });

  it("order: 3–8 items", () => {
    expect(ok({ ...order, data: { items: opts(2), scoring: "all" } })).toBe(false);
    expect(ok({ ...order, data: { items: opts(3), scoring: "all" } })).toBe(true);
    expect(ok({ ...order, data: { items: opts(8), scoring: "all" } })).toBe(true);
    expect(ok({ ...order, data: { items: opts(9), scoring: "all" } })).toBe(false);
  });

  it("hotspot: requires an image and ≥ 1 target within 0–1", () => {
    expect(ok({ ...hotspot, media: undefined })).toBe(false);
    expect(ok({ ...hotspot, media: { audioId: ID(3) } })).toBe(false);
    expect(ok({ ...hotspot, data: { targets: [] } })).toBe(false);
    expect(ok({ ...hotspot, data: { targets: [{ shape: "circle", x: 1.2, y: 0.5, r: 0.1 }] } })).toBe(false);
    expect(ok({ ...hotspot, data: { targets: [{ shape: "circle", x: 0.5, y: 0.5, r: 0 }] } })).toBe(false);
  });

  it("video: an alternative to the image, only for questions without a required image / audio", () => {
    const video = { videoId: ID(4) };
    for (const q of [single, multi, order, text]) expect(ok({ ...q, media: video })).toBe(true);
    // A question has an image or a video, never both.
    expect(ok({ ...single, media: { imageId: ID(2), videoId: ID(4) } })).toBe(false);
    // Hotspot needs a still image, music has its audio clip.
    expect(ok({ ...hotspot, media: { imageId: ID(2), videoId: ID(4) } })).toBe(false);
    expect(ok({ ...hotspot, media: video })).toBe(false);
    expect(ok({ ...music, media: { audioId: ID(3), videoId: ID(4) } })).toBe(false);
  });

  it("text: audio is optional but needs a clip (and the clip needs audio); no audio together with a video", () => {
    const clip = { start: 30, duration: 12 };
    const lyrics = { ...text, media: { audioId: ID(3) }, data: { ...text.data, clip } };
    expect(ok(lyrics)).toBe(true);
    // The song may come with a cover image, but not with a video (both would play on the host screen).
    expect(ok({ ...lyrics, media: { audioId: ID(3), imageId: ID(2) } })).toBe(true);
    expect(ok({ ...lyrics, media: { audioId: ID(3), videoId: ID(4) } })).toBe(false);
    expect(ok({ ...text, media: { audioId: ID(3) } })).toBe(false);
    expect(ok({ ...text, data: { ...text.data, clip } })).toBe(false);
    expect(ok({ ...lyrics, data: { ...text.data, clip: { start: 0, duration: 0 } } })).toBe(false);
  });

  it("text: every field needs ≥ 1 alias", () => {
    expect(ok({ ...text, data: { ...text.data, fields: [{ key: "answer", weight: 1, accepted: [] }] } })).toBe(false);
    expect(ok({ ...text, data: { ...text.data, fields: [{ key: "answer", weight: 1, accepted: ["  "] }] } })).toBe(
      false,
    );
    expect(ok({ ...text, data: { ...text.data, tolerance: "fuzzy" } })).toBe(false);
  });

  it("music: requires audio, aliases and weights summing to 1", () => {
    expect(ok({ ...music, media: {} })).toBe(false);
    const [artist, title] = music.data.fields;
    expect(ok({ ...music, data: { ...music.data, fields: [{ ...artist, accepted: [] }, title] } })).toBe(false);
    expect(ok({ ...music, data: { ...music.data, fields: [{ ...artist, weight: 0.6 }, title] } })).toBe(false);
    expect(
      ok({ ...music, data: { ...music.data, fields: [{ ...artist, weight: 0.3 }, { ...title, weight: 0.7 }] } }),
    ).toBe(true);
    expect(
      ok({ ...music, data: { ...music.data, fields: [{ ...artist, weight: 0.1 }, { ...title, weight: 0.9 }] } }),
    ).toBe(true);
    expect(ok({ ...music, data: { ...music.data, fields: [title, artist] } })).toBe(false);
  });

  it("number: finite value within limits, at most 3 decimals, non-negative tolerance", () => {
    const withData = (data: Record<string, unknown>) => ({ ...numberQ, data: { ...numberQ.data, ...data } });
    expect(ok(withData({ answer: -12.345 }))).toBe(true);
    expect(ok(withData({ answer: 1_000_000_000_000 }))).toBe(true);
    expect(ok(withData({ answer: 1_000_000_000_001 }))).toBe(false);
    expect(ok(withData({ answer: Infinity }))).toBe(false);
    expect(ok(withData({ answer: Number.NaN }))).toBe(false);
    expect(ok(withData({ answer: 1.2345 }))).toBe(false);
    expect(ok(withData({ mode: "tolerance", tolerance: 1.5 }))).toBe(true);
    expect(ok(withData({ mode: "tolerance", tolerance: -1 }))).toBe(false);
    expect(ok(withData({ mode: "nearest" }))).toBe(false);
    expect(ok({ ...numberQ, media: { audioId: ID(3) } })).toBe(false);
    expect(ok({ ...numberQ, media: { videoId: ID(4) } })).toBe(true);
  });

  it("trims texts", () => {
    const q = parse({ ...text, prompt: "  Hlavné mesto?  " });
    expect(q.prompt).toBe("Hlavné mesto?");
  });
});

describe("quizSchema", () => {
  it("applies default settings", () => {
    expect(quizSettingsSchema.parse({})).toEqual({
      speedBonus: true,
      showLeaderboardAfterEach: true,
      shuffleOptions: false,
    });
  });

  it("requires unique question ids", () => {
    const quiz = { id: ID(9), title: "Kvíz", description: null, settings: {}, questions: [single, single] };
    expect(quizSchema.safeParse(quiz).success).toBe(false);
    expect(quizSchema.safeParse({ ...quiz, questions: [single, { ...text, id: ID(10) }] }).success).toBe(true);
  });
});

describe("pages", () => {
  const page = { id: ID(20), type: "page", title: "Šport", description: "Ďalšia kategória", media: { imageId: ID(2) } };

  it("accepts a title, a description or an image alone, or all of them", () => {
    expect(pageSchema.safeParse(page).success).toBe(true);
    expect(pageSchema.safeParse({ id: ID(20), type: "page", title: "Šport", description: "" }).success).toBe(true);
    expect(pageSchema.safeParse({ id: ID(20), type: "page", title: "", description: "Popis" }).success).toBe(true);
    expect(pageSchema.safeParse({ id: ID(20), type: "page", title: "", description: "", media: { imageId: ID(2) } }).success).toBe(true);
  });

  it("needs some content and respects the limits", () => {
    expect(pageSchema.safeParse({ id: ID(20), type: "page", title: "", description: "" }).success).toBe(false);
    // Whitespace only is empty.
    expect(pageSchema.safeParse({ id: ID(20), type: "page", title: "  ", description: " \n ", media: {} }).success).toBe(false);
    expect(pageSchema.safeParse({ ...page, title: "x".repeat(121) }).success).toBe(false);
    expect(pageSchema.safeParse({ ...page, description: "x".repeat(1001) }).success).toBe(false);
  });

  it("sits between questions in a quiz and does not count as a question", () => {
    const quiz = { id: ID(9), title: "Kvíz", description: null, settings: {}, questions: [single, page, { ...text, id: ID(10) }, { ...page, id: ID(21) }] };
    const parsed = quizSchema.parse(quiz);
    expect(parsed.questions.map((q) => q.type)).toEqual(["single", "page", "text", "page"]);
    expect(parsed.questions.filter(isPage)).toHaveLength(2);
    expect(questionCount(parsed.questions)).toBe(2);
    expect(parsed.questions.map((_, i) => questionNumber(parsed.questions, i))).toEqual([1, 1, 2, 2]);
    // Page ids share the namespace of the question ids.
    expect(quizSchema.safeParse({ ...quiz, questions: [single, { ...page, id: single.id }] }).success).toBe(false);
  });

  it("page:show carries the image id only", () => {
    const event = { index: 1, title: "Šport", description: "", media: { imageId: ID(2), leak: true }, correctId: "x" };
    expect(pageShowEventSchema.parse(event)).toEqual({ index: 1, title: "Šport", description: "", media: { imageId: ID(2) } });
  });
});

describe("explanation", () => {
  const withExplanation = (explanation: unknown) => ({ ...single, explanation });

  it("is optional and accepts a text, an image, a video or an audio clip alone, or text + image + audio", () => {
    expect(ok(single)).toBe(true);
    expect(ok(withExplanation({ text: "Pretože 2 + 2 = 4." }))).toBe(true);
    expect(ok(withExplanation({ text: "", media: { imageId: ID(2) } }))).toBe(true);
    expect(ok(withExplanation({ text: "", media: { videoId: ID(4) } }))).toBe(true);
    expect(ok(withExplanation({ text: "", media: { audioId: ID(3) }, clip: { start: 0, duration: 15 } }))).toBe(true);
    expect(
      ok(withExplanation({ text: "Text", media: { imageId: ID(2), audioId: ID(3) }, clip: { start: 0, duration: 15 } })),
    ).toBe(true);
  });

  it("needs some content and respects the text limit", () => {
    expect(ok(withExplanation({ text: "" }))).toBe(false);
    // Whitespace only is empty.
    expect(ok(withExplanation({ text: " \n ", media: {} }))).toBe(false);
    expect(ok(withExplanation({ text: "x".repeat(1000) }))).toBe(true);
    expect(ok(withExplanation({ text: "x".repeat(1001) }))).toBe(false);
    expect(parse(withExplanation({ text: "  Pretože.  " })).explanation?.text).toBe("Pretože.");
  });

  it("has an image or a video, no audio together with a video, and a clip exactly with audio", () => {
    expect(ok(withExplanation({ text: "", media: { imageId: ID(2), videoId: ID(4) } }))).toBe(false);
    expect(ok(withExplanation({ text: "", media: { videoId: ID(4), audioId: ID(3) }, clip: { start: 0, duration: 15 } }))).toBe(
      false,
    );
    expect(ok(withExplanation({ text: "", media: { audioId: ID(3) } }))).toBe(false);
    expect(ok(withExplanation({ text: "Text", clip: { start: 0, duration: 15 } }))).toBe(false);
    expect(ok(withExplanation({ text: "", media: { audioId: ID(3) }, clip: { start: 0, duration: 0 } }))).toBe(false);
  });

  it("explanation:show strips unknown keys", () => {
    const event = { index: 0, number: 1, prompt: "Otázka?", text: "Pretože.", media: { imageId: ID(2), leak: true }, correctId: "x" };
    expect(explanationShowEventSchema.parse(event)).toEqual({
      index: 0,
      number: 1,
      prompt: "Otázka?",
      text: "Pretože.",
      media: { imageId: ID(2) },
    });
  });
});

describe("parseAnswerPayload", () => {
  it("single: option must belong to the question", () => {
    const q = parse(single);
    expect(parseAnswerPayload(q, { optionId: "o1" })).toEqual({ type: "single", payload: { optionId: "o1" } });
    expect(parseAnswerPayload(q, { optionId: "zz" })).toBeNull();
    expect(parseAnswerPayload(q, { optionIds: ["o1"] })).toBeNull();
  });

  it("multi: unique ids from the question", () => {
    const q = parse(multi);
    expect(parseAnswerPayload(q, { optionIds: ["o0", "o2"] })).not.toBeNull();
    expect(parseAnswerPayload(q, { optionIds: ["o0", "o0"] })).toBeNull();
    expect(parseAnswerPayload(q, { optionIds: ["o0", "x"] })).toBeNull();
    expect(parseAnswerPayload(q, { optionIds: [] })).toBeNull();
  });

  it("order: must be a permutation of the items", () => {
    const q = parse(order);
    expect(parseAnswerPayload(q, { order: ["o3", "o2", "o1", "o0"] })).not.toBeNull();
    expect(parseAnswerPayload(q, { order: ["o3", "o2", "o1"] })).toBeNull();
    expect(parseAnswerPayload(q, { order: ["o3", "o3", "o1", "o0"] })).toBeNull();
    expect(parseAnswerPayload(q, { order: ["o3", "o2", "o1", "x"] })).toBeNull();
  });

  it("hotspot: coordinates within 0–1", () => {
    const q = parse(hotspot);
    expect(parseAnswerPayload(q, { x: 0, y: 1 })).not.toBeNull();
    expect(parseAnswerPayload(q, { x: 1.01, y: 0.5 })).toBeNull();
    expect(parseAnswerPayload(q, { x: -0.1, y: 0.5 })).toBeNull();
  });

  it("text: trims and limits to 100 chars per field", () => {
    const q = parse(text);
    expect(parseAnswerPayload(q, { answers: { answer: "  BA  " } })).toEqual({
      type: "text",
      payload: { answers: { answer: "BA" } },
    });
    expect(parseAnswerPayload(q, { answers: { answer: "x".repeat(101) } })).toBeNull();
  });

  it("music: requires both fields", () => {
    const q = parse(music);
    expect(parseAnswerPayload(q, { answers: { artist: "Metallica", title: "" } })).not.toBeNull();
    expect(parseAnswerPayload(q, { answers: { artist: "Metallica" } })).toBeNull();
  });
});

describe("parseAnswerPayload – number", () => {
  const q = parse(numberQ);

  it("accepts a finite number with at most 3 decimals", () => {
    expect(parseAnswerPayload(q, { value: 2026 })).toEqual({ type: "number", payload: { value: 2026 } });
    expect(parseAnswerPayload(q, { value: -0.5 })).not.toBeNull();
  });

  it("rejects strings, non-finite, out-of-range and over-precise values", () => {
    expect(parseAnswerPayload(q, { value: "2026" })).toBeNull();
    expect(parseAnswerPayload(q, { value: Infinity })).toBeNull();
    expect(parseAnswerPayload(q, { value: 1e13 })).toBeNull();
    expect(parseAnswerPayload(q, { value: 0.0001 })).toBeNull();
    expect(parseAnswerPayload(q, {})).toBeNull();
  });
});

describe("isPermutation", () => {
  it("detects permutations", () => {
    expect(isPermutation(["b", "a"], ["a", "b"])).toBe(true);
    expect(isPermutation(["a", "a"], ["a", "b"])).toBe(false);
    expect(isPermutation(["a"], ["a", "b"])).toBe(false);
  });
});

describe("PIN and nickname helpers", () => {
  it("normalizes and formats PIN input", () => {
    expect(normalizePinInput("123 456")).toBe("123456");
    expect(pinSchema.safeParse("123456").success).toBe(true);
    expect(pinSchema.safeParse("12345").success).toBe(false);
    expect(pinSchema.safeParse("123 456").success).toBe(false);
    expect(formatPin("123456")).toBe("123 456");
  });

  it("nickname key ignores case and diacritics", () => {
    expect(nicknameKey("Peťo")).toBe(nicknameKey("PETO"));
    expect(nicknameKey("  Zuzka ")).toBe("zuzka");
  });

  it("nickname is 1–20 chars after trimming", () => {
    expect(playerJoinPayloadSchema.safeParse({ pin: "123456", nickname: "  " }).success).toBe(false);
    expect(playerJoinPayloadSchema.safeParse({ pin: "123456", nickname: "x".repeat(21) }).success).toBe(false);
    expect(playerJoinPayloadSchema.safeParse({ pin: "123456", nickname: "Jano" }).success).toBe(true);
  });
});

describe("avatar", () => {
  const avatar = { body: 4, head: 2, glasses: 0, hat: null, mustache: 2 };

  it("accepts every part within its variant range, accessories may be null", () => {
    expect(avatarSchema.safeParse(avatar).success).toBe(true);
    expect(avatarSchema.safeParse(DEFAULT_AVATAR).success).toBe(true);
  });

  it("rejects out-of-range, fractional and missing required parts", () => {
    expect(avatarSchema.safeParse({ ...avatar, body: 5 }).success).toBe(false);
    expect(avatarSchema.safeParse({ ...avatar, head: -1 }).success).toBe(false);
    expect(avatarSchema.safeParse({ ...avatar, hat: 3 }).success).toBe(false);
    expect(avatarSchema.safeParse({ ...avatar, glasses: 0.5 }).success).toBe(false);
    expect(avatarSchema.safeParse({ ...avatar, body: null }).success).toBe(false);
  });

  it("player:join falls back to the default avatar and validates a sent one", () => {
    const parsed = playerJoinPayloadSchema.parse({ pin: "123456", nickname: "Jano" });
    expect(parsed.avatar).toEqual(DEFAULT_AVATAR);
    expect(playerJoinPayloadSchema.parse({ pin: "123456", nickname: "Jano", avatar }).avatar).toEqual(avatar);
    expect(
      playerJoinPayloadSchema.safeParse({ pin: "123456", nickname: "Jano", avatar: { ...avatar, mustache: 9 } }).success,
    ).toBe(false);
  });
});

describe("question:start whitelist", () => {
  const timing = { index: 0, total: 3, number: 1, count: 3, timeLimit: 30, deadline: 1_000_030_000, serverNow: 1_000_000_000 };

  it("strips correct answers when parsing a server-built payload", () => {
    const leaky = {
      ...timing,
      type: "single",
      prompt: "Q",
      media: {},
      options: opts(2),
      correctId: "o0",
      data: { correctId: "o0" },
    };
    const parsed = questionStartEventSchema.parse(leaky);
    expect(parsed).not.toHaveProperty("correctId");
    expect(parsed).not.toHaveProperty("data");
  });

  it("strips accepted aliases from fields", () => {
    const leaky = {
      ...timing,
      type: "text",
      prompt: "Q",
      media: {},
      fields: [{ key: "answer", weight: 1, accepted: ["secret"] }],
    };
    const parsed = questionStartEventSchema.parse(leaky);
    expect(parsed.type === "text" && parsed.fields[0]).toEqual({ key: "answer", weight: 1 });
  });

  it("strips the correct number of a number question", () => {
    const parsed = questionStartEventSchema.parse({
      ...timing,
      type: "number",
      prompt: "Q",
      media: {},
      mode: "tolerance",
      tolerance: 1,
      answer: 2026,
      data: { answer: 2026 },
    });
    expect(parsed).not.toHaveProperty("answer");
    expect(parsed).not.toHaveProperty("data");
    expect(parsed).toMatchObject({ mode: "tolerance", tolerance: 1 });
  });

  it("strips hotspot targets", () => {
    const parsed = questionStartEventSchema.parse({
      ...timing,
      type: "hotspot",
      prompt: "Q",
      media: { imageId: ID(2) },
      targets: [{ shape: "circle", x: 0.5, y: 0.5, r: 0.1 }],
    });
    expect(parsed).not.toHaveProperty("targets");
  });
});

describe("gameStateSchema", () => {
  it("parses a player lobby state", () => {
    const state = {
      role: "player",
      pin: "123456",
      state: "LOBBY",
      currentIndex: -1,
      total: 5,
      serverNow: 1,
      question: null,
      page: null,
      explanation: null,
      leaderboard: null,
      finished: null,
      playerId: ID(4),
      nickname: "Jano",
      avatar: DEFAULT_AVATAR,
      score: 0,
      rank: null,
      hasAnswered: false,
      result: null,
    };
    expect(gameStateSchema.safeParse(state).success).toBe(true);
    expect(gameStateSchema.safeParse({ ...state, state: "PAUSED" }).success).toBe(false);
  });
});
