import { QUESTION_TYPES, questionSchema, type Question } from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import { changeQuestionType, createQuestion, duplicateQuestion, hasTypeSpecificContent } from "./defaults";

const IMAGE_ID = "11111111-1111-4111-8111-111111111111";
const AUDIO_ID = "22222222-2222-4222-8222-222222222222";

describe("createQuestion", () => {
  it.each(QUESTION_TYPES)("creates a %s question with documented defaults", (type) => {
    const q = createQuestion(type);
    expect(q.type).toBe(type);
    expect(q.prompt).toBe("");
    expect(q.timeLimit).toBe(30);
    expect(q.points).toBe(1000);
    expect(q.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("becomes valid once the host fills in the required fields", () => {
    const q = createQuestion("single");
    q.prompt = "Hlavné mesto Austrálie?";
    q.data.options.forEach((o, i) => (o.text = `Mesto ${i + 1}`));
    expect(questionSchema.safeParse(q).success).toBe(true);
  });

  it("music starts with two fields weighted 0.5 each", () => {
    const q = createQuestion("music");
    expect(q.data.fields.map((f) => [f.key, f.weight])).toEqual([
      ["artist", 0.5],
      ["title", 0.5],
    ]);
    expect(q.data.clip).toEqual({ start: 0, duration: 15 });
  });

  it("number starts without an answer, so it is invalid until the host enters one", () => {
    const q = createQuestion("number");
    q.prompt = "V ktorom roku vznikla táto appka?";
    expect(q.data).toMatchObject({ mode: "closest", tolerance: 1 });
    expect(questionSchema.safeParse(q).success).toBe(false);
    q.data.answer = 2026;
    expect(questionSchema.safeParse(q).success).toBe(true);
  });

  it("order starts with the minimum of 3 items", () => {
    expect(createQuestion("order").data.items).toHaveLength(3);
  });
});

describe("changeQuestionType", () => {
  it("keeps prompt, time limit, points and compatible media", () => {
    const single = createQuestion("single");
    single.prompt = "Kde je Bratislava?";
    single.timeLimit = 45;
    single.points = 2;
    single.media = { imageId: IMAGE_ID };
    const hotspot = changeQuestionType(single, "hotspot");
    expect(hotspot).toMatchObject({
      id: single.id,
      type: "hotspot",
      prompt: "Kde je Bratislava?",
      timeLimit: 45,
      points: 2,
      media: { imageId: IMAGE_ID },
      data: { targets: [] },
    });
  });

  it("drops media the new type cannot use", () => {
    const music = createQuestion("music");
    music.media = { audioId: AUDIO_ID };
    expect(changeQuestionType(music, "single").media).toBeUndefined();
    const text = createQuestion("text");
    text.media = { imageId: IMAGE_ID };
    expect(changeQuestionType(text, "music").media).toBeUndefined();
  });

  it("keeps the audio of a music question as a text question with a default clip", () => {
    const music = createQuestion("music");
    music.media = { audioId: AUDIO_ID };
    const text = changeQuestionType(music, "text");
    expect(text.media).toEqual({ audioId: AUDIO_ID });
    expect(text.type === "text" && text.data.clip).toEqual({ start: 0, duration: 15 });
    // ...and back: a text question with audio keeps it as a music question.
    expect(changeQuestionType(text, "music").media).toEqual({ audioId: AUDIO_ID });
  });
});

describe("hasTypeSpecificContent", () => {
  it("is false for fresh questions and true once something was entered", () => {
    for (const type of QUESTION_TYPES) expect(hasTypeSpecificContent(createQuestion(type))).toBe(false);
    const text = createQuestion("text");
    text.data.fields[0].accepted.push("Gerlach");
    expect(hasTypeSpecificContent(text)).toBe(true);
    const lyrics = createQuestion("text");
    lyrics.media = { audioId: AUDIO_ID };
    expect(hasTypeSpecificContent(lyrics)).toBe(true);
    const number = createQuestion("number");
    number.data.answer = 2026;
    expect(hasTypeSpecificContent(number)).toBe(true);
    const hotspot = createQuestion("hotspot");
    hotspot.data.targets.push({ shape: "circle", x: 0.5, y: 0.5, r: 0.1 });
    expect(hasTypeSpecificContent(hotspot)).toBe(true);
  });
});

describe("duplicateQuestion", () => {
  it("assigns new ids and remaps the correct answers", () => {
    const multi = createQuestion("multi");
    const [a, b] = multi.data.options;
    multi.data.correctIds = [a?.id ?? "", b?.id ?? ""];
    const copy = duplicateQuestion(multi) as Extract<Question, { type: "multi" }>;
    expect(copy.id).not.toBe(multi.id);
    expect(copy.data.options.map((o) => o.id)).not.toEqual(multi.data.options.map((o) => o.id));
    expect(copy.data.correctIds).toEqual([copy.data.options[0]?.id, copy.data.options[1]?.id]);
  });
});
