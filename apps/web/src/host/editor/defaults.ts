import {
  DEFAULT_QUIZ_SETTINGS,
  LIMITS,
  type MediaRef,
  type Question,
  type QuestionOf,
  type QuestionType,
} from "@nexquiz/shared";
import { sk } from "@/i18n/sk";
import { localId, uuidV4 } from "@/lib/ids";

/** Number of empty options a new `single` / `multi` question starts with. */
export const NEW_CHOICE_OPTIONS = 4;
/** Default clip of a new `music` question (seconds). */
export const DEFAULT_CLIP = { start: 0, duration: 15 } as const;

export { DEFAULT_QUIZ_SETTINGS };

function emptyOptions(count: number): { id: string; text: string }[] {
  return Array.from({ length: count }, () => ({ id: localId(), text: "" }));
}

interface Base {
  id: string;
  prompt: string;
  timeLimit: number;
  points: number;
  media?: MediaRef;
}

function build<T extends QuestionType>(type: T, base: Base): QuestionOf<T>;
function build(type: QuestionType, base: Base): Question {
  switch (type) {
    case "single": {
      const options = emptyOptions(NEW_CHOICE_OPTIONS);
      return { ...base, type, data: { options, correctId: options[0]?.id ?? "" } };
    }
    case "multi": {
      const options = emptyOptions(NEW_CHOICE_OPTIONS);
      return { ...base, type, data: { options, correctIds: options[0] ? [options[0].id] : [], scoring: "partial" } };
    }
    case "order":
      return { ...base, type, data: { items: emptyOptions(LIMITS.orderItems.min), scoring: "partial" } };
    case "hotspot":
      return { ...base, type, data: { targets: [] } };
    case "text":
      return { ...base, type, data: { fields: [{ key: "answer", weight: 1, accepted: [] }], tolerance: "normal" } };
    case "music":
      return {
        ...base,
        type,
        data: {
          clip: { ...DEFAULT_CLIP },
          fields: [
            { key: "artist", label: sk.fields.artist, weight: 0.5, accepted: [] },
            { key: "title", label: sk.fields.title, weight: 0.5, accepted: [] },
          ],
          tolerance: "normal",
        },
      };
  }
}

/** A new, empty question of `type` (invalid until the host fills it in). */
export function createQuestion<T extends QuestionType>(type: T): QuestionOf<T> {
  return build(type, {
    id: uuidV4(),
    prompt: "",
    timeLimit: LIMITS.timeLimit.default,
    points: LIMITS.points.default,
  });
}

/** Which media a question type uses. */
export function mediaKindsFor(type: QuestionType): { image: boolean; audio: boolean; imageRequired: boolean } {
  return {
    image: type !== "music",
    audio: type === "music",
    imageRequired: type === "hotspot",
  };
}

/** Keeps only the media the new type supports. */
function mediaFor(type: QuestionType, media: MediaRef | undefined): MediaRef | undefined {
  if (!media) return undefined;
  const kinds = mediaKindsFor(type);
  const next: MediaRef = {};
  if (kinds.image && media.imageId) next.imageId = media.imageId;
  if (kinds.audio && media.audioId) next.audioId = media.audioId;
  return next.imageId || next.audioId ? next : undefined;
}

/**
 * Changes the type of `question`: prompt, time limit, points and compatible
 * media survive, the type-specific `data` is replaced by fresh defaults.
 */
export function changeQuestionType(question: Question, type: QuestionType): Question {
  const media = mediaFor(type, question.media);
  const base: Base = {
    id: question.id,
    prompt: question.prompt,
    timeLimit: question.timeLimit,
    points: question.points,
  };
  if (media) base.media = media;
  return build(type, base);
}

/** True when changing the type would throw away something the host entered. */
export function hasTypeSpecificContent(question: Question): boolean {
  switch (question.type) {
    case "single":
    case "multi":
      return question.data.options.some((o) => o.text.trim() !== "");
    case "order":
      return question.data.items.some((i) => i.text.trim() !== "");
    case "hotspot":
      return question.data.targets.length > 0;
    case "text":
      return question.data.fields.some((f) => f.accepted.length > 0);
    case "music":
      return question.data.fields.some((f) => f.accepted.length > 0) || question.media?.audioId !== undefined;
  }
}

/** JSON deep copy (works on Vue reactive proxies, unlike `structuredClone`). */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deep copy with a new question id and new option / item ids. */
export function duplicateQuestion(question: Question): Question {
  const copy = cloneJson(question);
  copy.id = uuidV4();
  if (copy.type === "single") {
    const map = new Map(copy.data.options.map((o) => [o.id, localId()]));
    copy.data.options = copy.data.options.map((o) => ({ ...o, id: map.get(o.id) ?? localId() }));
    copy.data.correctId = map.get(copy.data.correctId) ?? copy.data.correctId;
  } else if (copy.type === "multi") {
    const map = new Map(copy.data.options.map((o) => [o.id, localId()]));
    copy.data.options = copy.data.options.map((o) => ({ ...o, id: map.get(o.id) ?? localId() }));
    copy.data.correctIds = copy.data.correctIds.map((id) => map.get(id) ?? id);
  } else if (copy.type === "order") {
    copy.data.items = copy.data.items.map((i) => ({ ...i, id: localId() }));
  }
  return copy;
}
