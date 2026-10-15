import {
  explanationShowEventSchema,
  pageShowEventSchema,
  questionStartEventSchema,
  type CorrectAnswer,
  type ExplanationMedia,
  type ExplanationShowEvent,
  type MediaRef,
  type Option,
  type Page,
  type PageShowEvent,
  type PublicField,
  type Question,
  type QuestionStartEvent,
} from "@nexquiz/shared";

export interface QuestionStartInput {
  question: Question;
  index: number;
  total: number;
  /** 1-based question number and number of questions (pages are not counted). */
  number: number;
  count: number;
  /** Presentation order from `game:{pin}:shuffle:{idx}` (null = authored order). */
  order: readonly string[] | null;
  deadline: number;
  serverNow: number;
}

function publicMedia(media: MediaRef | undefined): MediaRef {
  const out: MediaRef = {};
  if (media?.imageId !== undefined) out.imageId = media.imageId;
  if (media?.audioId !== undefined) out.audioId = media.audioId;
  if (media?.videoId !== undefined) out.videoId = media.videoId;
  return out;
}

/** Copies `{ id, text }` only, in the presentation order. */
function arrange(options: readonly Option[], order: readonly string[] | null): Option[] {
  const plain = options.map((o) => ({ id: o.id, text: o.text }));
  if (!order) return plain;
  const byId = new Map(plain.map((o) => [o.id, o]));
  const arranged = order.flatMap((id) => {
    const o = byId.get(id);
    return o ? [o] : [];
  });
  return arranged.length === plain.length ? arranged : plain;
}

function publicFields(fields: readonly { key: PublicField["key"]; label?: string | undefined; weight: number }[]): PublicField[] {
  return fields.map((f) => (f.label === undefined ? { key: f.key, weight: f.weight } : { key: f.key, label: f.label, weight: f.weight }));
}

/**
 * Builds `question:start` from an explicit whitelist per type. It never
 * contains `correctId`, `correctIds`, the correct item order, `targets` or
 * `accepted`; the result is additionally parsed with the shared schema,
 * which strips unknown keys.
 */
export function buildQuestionStart(input: QuestionStartInput): QuestionStartEvent {
  const { question } = input;
  const base = {
    index: input.index,
    total: input.total,
    number: input.number,
    count: input.count,
    prompt: question.prompt,
    media: publicMedia(question.media),
    timeLimit: question.timeLimit,
    deadline: input.deadline,
    serverNow: input.serverNow,
  };

  let event: QuestionStartEvent;
  switch (question.type) {
    case "single":
      event = { ...base, type: "single", options: arrange(question.data.options, input.order) };
      break;
    case "multi":
      event = { ...base, type: "multi", options: arrange(question.data.options, input.order) };
      break;
    case "order": {
      // Never fall back to the authored (= correct) order: reversed is never identity for ≥ 2 items.
      const order = input.order ?? [...question.data.items].reverse().map((i) => i.id);
      const items = arrange(question.data.items, order);
      event = { ...base, type: "order", items };
      break;
    }
    case "hotspot":
      event = { ...base, type: "hotspot" };
      break;
    case "text":
      event = {
        ...base,
        type: "text",
        fields: publicFields(question.data.fields),
        ...(question.data.clip ? { clip: { start: question.data.clip.start, duration: question.data.clip.duration } } : {}),
      };
      break;
    case "music":
      event = {
        ...base,
        type: "music",
        fields: publicFields(question.data.fields),
        clip: { start: question.data.clip.start, duration: question.data.clip.duration },
      };
      break;
    case "number":
      // Mode and tolerance are a hint for players; `data.answer` is never copied.
      event = { ...base, type: "number", mode: question.data.mode, tolerance: question.data.tolerance };
      break;
  }
  return questionStartEventSchema.parse(event);
}

/**
 * Player variant of `question:start`: drops `media.audioId`. An uploaded
 * audio file keeps its tags (artist / title = the answer of a music
 * question, the song of a lyrics question) and the whole song (the lyrics to
 * fill in), so players never learn its id; a player with sound on their own
 * device gets only the cut, tag-free clip (`GET /api/games/:pin/questions/:index/clip`).
 * Images and the video id stay: the hotspot needs the image on the phone and
 * the video plays there only when the player turned sound and video on.
 */
export function forPlayers(event: QuestionStartEvent): QuestionStartEvent;
export function forPlayers(event: QuestionStartEvent | null): QuestionStartEvent | null;
export function forPlayers(event: QuestionStartEvent | null): QuestionStartEvent | null {
  if (!event) return null;
  const media: MediaRef = {};
  if (event.media.imageId !== undefined) media.imageId = event.media.imageId;
  if (event.media.videoId !== undefined) media.videoId = event.media.videoId;
  return { ...event, media };
}

/** `page:show` – the same content for the host and the players; only the image id is exposed. */
export function buildPageShow(page: Page, index: number): PageShowEvent {
  return pageShowEventSchema.parse({
    index,
    title: page.title,
    description: page.description,
    media: page.media?.imageId === undefined ? {} : { imageId: page.media.imageId },
  });
}

/**
 * `explanation:show` for the host (with `media.audioId`), or null when the
 * question has no explanation. Sent only after the question was revealed.
 */
export function buildExplanationShow(question: Question, index: number, number: number): ExplanationShowEvent | null {
  const { explanation } = question;
  if (!explanation) return null;
  const media: ExplanationMedia = {};
  if (explanation.media?.imageId !== undefined) media.imageId = explanation.media.imageId;
  if (explanation.media?.videoId !== undefined) media.videoId = explanation.media.videoId;
  if (explanation.media?.audioId !== undefined) media.audioId = explanation.media.audioId;
  return explanationShowEventSchema.parse({
    index,
    number,
    prompt: question.prompt,
    text: explanation.text,
    media,
    ...(explanation.clip ? { clip: { start: explanation.clip.start, duration: explanation.clip.duration } } : {}),
  });
}

/**
 * Player variant of `explanation:show`: drops `media.audioId` like
 * `forPlayers`, a player with sound on gets only the cut clip.
 */
export function explanationForPlayers(event: ExplanationShowEvent): ExplanationShowEvent;
export function explanationForPlayers(event: ExplanationShowEvent | null): ExplanationShowEvent | null;
export function explanationForPlayers(event: ExplanationShowEvent | null): ExplanationShowEvent | null {
  if (!event) return null;
  const media: ExplanationMedia = {};
  if (event.media.imageId !== undefined) media.imageId = event.media.imageId;
  if (event.media.videoId !== undefined) media.videoId = event.media.videoId;
  return { ...event, media };
}

/** Correct answer of a question – sent only after the question ended. */
export function buildCorrectAnswer(question: Question): CorrectAnswer {
  switch (question.type) {
    case "single":
      return { type: "single", correctId: question.data.correctId };
    case "multi":
      return { type: "multi", correctIds: [...question.data.correctIds] };
    case "order":
      return { type: "order", items: question.data.items.map((i) => ({ id: i.id, text: i.text })) };
    case "hotspot":
      return {
        type: "hotspot",
        targets: question.data.targets.map((t) => ({ shape: t.shape, x: t.x, y: t.y, r: t.r })),
      };
    case "text":
      return {
        type: "text",
        fields: question.data.fields.map((f) =>
          f.label === undefined
            ? { key: f.key, accepted: [...f.accepted] }
            : { key: f.key, label: f.label, accepted: [...f.accepted] },
        ),
      };
    case "music":
      return {
        type: "music",
        fields: question.data.fields.map((f) =>
          f.label === undefined
            ? { key: f.key, accepted: [...f.accepted] }
            : { key: f.key, label: f.label, accepted: [...f.accepted] },
        ),
      };
    case "number":
      return { type: "number", answer: question.data.answer, mode: question.data.mode, tolerance: question.data.tolerance };
  }
}
