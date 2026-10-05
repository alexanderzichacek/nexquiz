import {
  questionStartEventSchema,
  type CorrectAnswer,
  type MediaRef,
  type Option,
  type PublicField,
  type Question,
  type QuestionStartEvent,
} from "@nexquiz/shared";

export interface QuestionStartInput {
  question: Question;
  index: number;
  total: number;
  /** Presentation order from `game:{pin}:shuffle:{idx}` (null = authored order). */
  order: readonly string[] | null;
  deadline: number;
  serverNow: number;
}

function publicMedia(media: MediaRef | undefined): MediaRef {
  const out: MediaRef = {};
  if (media?.imageId !== undefined) out.imageId = media.imageId;
  if (media?.audioId !== undefined) out.audioId = media.audioId;
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
      event = { ...base, type: "text", fields: publicFields(question.data.fields) };
      break;
    case "music":
      event = {
        ...base,
        type: "music",
        fields: publicFields(question.data.fields),
        clip: { start: question.data.clip.start, duration: question.data.clip.duration },
      };
      break;
  }
  return questionStartEventSchema.parse(event);
}

/**
 * Player variant of `question:start`: drops `media.audioId`. Audio plays on
 * the host screen only, and the uploaded file keeps its tags (artist /
 * title = the answer of a music question), so players must never learn its
 * id before reveal. Images stay (hotspot needs them on the phone).
 */
export function forPlayers(event: QuestionStartEvent): QuestionStartEvent;
export function forPlayers(event: QuestionStartEvent | null): QuestionStartEvent | null;
export function forPlayers(event: QuestionStartEvent | null): QuestionStartEvent | null {
  if (!event) return null;
  const media: MediaRef = event.media.imageId === undefined ? {} : { imageId: event.media.imageId };
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
  }
}
