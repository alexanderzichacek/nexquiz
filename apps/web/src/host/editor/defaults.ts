import {
  DEFAULT_QUIZ_SETTINGS,
  LIMITS,
  isPage,
  PAGE_TYPE,
  type Explanation,
  type MediaRef,
  type Page,
  type Question,
  type QuestionOf,
  type QuestionType,
  type QuizItem,
} from "@nexquiz/shared";
import { sk } from "@/i18n/sk";
import { localId, uuidV4 } from "@/lib/ids";

/** Number of empty options a new `single` / `multi` question starts with. */
export const NEW_CHOICE_OPTIONS = 4;
/** Default clip of a new `music` question and of a `text` question once audio is attached (seconds). */
export const DEFAULT_CLIP = { start: 0, duration: 15 } as const;

/** Tolerance a new `number` question starts with (used once the host switches to the tolerance mode). */
export const DEFAULT_NUMBER_TOLERANCE = 1;

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
  explanation?: Explanation;
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
      return {
        ...base,
        type,
        data: {
          fields: [{ key: "answer", weight: 1, accepted: [] }],
          tolerance: "normal",
          // Audio carried over from a `music` question needs its clip.
          ...(base.media?.audioId ? { clip: { ...DEFAULT_CLIP } } : {}),
        },
      };
    case "number":
      // No answer yet (NaN → null in JSON): invalid until the host enters one, like the empty aliases of a text question.
      return { ...base, type, data: { answer: Number.NaN, mode: "closest", tolerance: DEFAULT_NUMBER_TOLERANCE } };
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

/** A new, empty explanation (invalid until the host fills in a text, an image, a video or audio). */
export function createExplanation(): Explanation {
  return { text: "" };
}

/** True when removing the explanation would throw away something the host entered. */
export function hasExplanationContent(explanation: Explanation | undefined): boolean {
  if (!explanation) return false;
  const { media } = explanation;
  return explanation.text.trim() !== "" || !!media?.imageId || !!media?.videoId || !!media?.audioId;
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

/** A new, empty page (invalid until the host fills in a title, a description or an image). */
export function createPage(): Page {
  return { id: uuidV4(), type: PAGE_TYPE, title: "", description: "" };
}

/** Which media a question type uses. */
export function mediaKindsFor(type: QuestionType): {
  image: boolean;
  audio: boolean;
  video: boolean;
  imageRequired: boolean;
} {
  return {
    image: type !== "music",
    // `music` requires audio; `text` may have it (e.g. a song cut off before the lyrics to fill in).
    audio: type === "music" || type === "text",
    // Hotspot needs a still image to tap on, music has its audio clip.
    video: type !== "music" && type !== "hotspot",
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
  if (kinds.video && media.videoId) next.videoId = media.videoId;
  return next.imageId || next.audioId || next.videoId ? next : undefined;
}

/**
 * Changes the type of `question`: prompt, time limit, points, compatible
 * media and the explanation survive, the type-specific `data` is replaced by
 * fresh defaults.
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
  if (question.explanation) base.explanation = question.explanation;
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
      return question.data.fields.some((f) => f.accepted.length > 0) || question.media?.audioId !== undefined;
    case "music":
      return question.data.fields.some((f) => f.accepted.length > 0) || question.media?.audioId !== undefined;
    case "number":
      return Number.isFinite(question.data.answer);
  }
}

/** JSON deep copy (works on Vue reactive proxies, unlike `structuredClone`). */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Deep copy with a new id (and new option / item ids of a question). */
export function duplicateQuestion(item: QuizItem): QuizItem {
  const copy = cloneJson(item);
  copy.id = uuidV4();
  if (isPage(copy)) return copy;
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
