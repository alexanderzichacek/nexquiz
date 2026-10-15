import {
  isPage,
  quizUpdateRequestSchema,
  weightToThousandths,
  type Question,
  type QuizItem,
  type QuizUpdateRequest,
} from "@nexquiz/shared";
import { sk } from "@/i18n/sk";

/** Inline error messages keyed by dotted path inside a question (`data.options.0.text`). */
export type ErrorMap = Record<string, string>;

export interface QuizValidation {
  valid: boolean;
  /** Quiz level errors (`title`, `description`, `questions`). */
  quiz: ErrorMap;
  /** Errors per question id. */
  questions: Record<string, ErrorMap>;
}

/** Path pattern (numbers replaced by `*`) → Slovak message. */
const MESSAGES: Record<string, string> = {
  title: sk.editorErrors.title,
  description: sk.editorErrors.description,
  questions: sk.editorErrors.questions,
  prompt: sk.editorErrors.prompt,
  timeLimit: sk.editorErrors.timeLimit,
  points: sk.editorErrors.points,
  "media.imageId": sk.editorErrors.image,
  "media.audioId": sk.editorErrors.audio,
  "media.videoId": sk.editorErrors.video,
  // Pages: their `title` / `description` are keyed `pageTitle` / `pageDescription` (see `validateQuiz`).
  content: sk.editorErrors.pageContent,
  pageTitle: sk.editorErrors.pageTitle,
  pageDescription: sk.editorErrors.pageDescription,
  "data.options": sk.editorErrors.options,
  "data.options.*.text": sk.editorErrors.optionText,
  "data.correctId": sk.editorErrors.correctId,
  "data.correctIds": sk.editorErrors.correctIds,
  "data.correctIds.*": sk.editorErrors.correctIds,
  "data.items": sk.editorErrors.items,
  "data.items.*.text": sk.editorErrors.itemText,
  "data.targets": sk.editorErrors.targets,
  "data.fields": sk.editorErrors.weightsSum,
  "data.fields.*.accepted": sk.editorErrors.accepted,
  "data.fields.*.accepted.*": sk.editorErrors.alias,
  "data.fields.*.weight": sk.editorErrors.weight,
  "data.answer": sk.editorErrors.numberAnswer,
  "data.tolerance": sk.editorErrors.numberTolerance,
  "data.clip.start": sk.editorErrors.clipStart,
  "data.clip.duration": sk.editorErrors.clipDuration,
  "explanation.content": sk.editorErrors.explanationContent,
  "explanation.text": sk.editorErrors.explanationText,
  "explanation.media.imageId": sk.editorErrors.image,
  "explanation.media.videoId": sk.editorErrors.explanationVideo,
  "explanation.media.audioId": sk.editorErrors.audio,
  "explanation.clip.start": sk.editorErrors.clipStart,
  "explanation.clip.duration": sk.editorErrors.clipDuration,
};

/**
 * Error key used by the UI for a path. Errors of single aliases are shown
 * at the alias list, errors of correct ids at the correctness toggle.
 */
function keyFor(path: readonly PropertyKey[]): string {
  const parts = path.map(String);
  const pattern = parts.map((p) => (/^\d+$/.test(p) ? "*" : p)).join(".");
  if (pattern === "data.fields.*.accepted.*") return parts.slice(0, 4).join(".");
  if (pattern === "data.correctIds.*") return "data.correctIds";
  return parts.join(".");
}

export function messageFor(path: readonly PropertyKey[]): string {
  const pattern = path.map((p) => (/^\d+$/.test(String(p)) ? "*" : String(p))).join(".");
  return MESSAGES[pattern] ?? sk.editorErrors.generic;
}

function add(map: ErrorMap, path: readonly PropertyKey[]): void {
  const key = keyFor(path);
  map[key] ??= messageFor(path);
}

/** A page's `title` / `description` share their names with the quiz fields; key them separately. */
function pagePath(item: QuizItem | undefined, path: readonly PropertyKey[]): readonly PropertyKey[] {
  if (!item || !isPage(item)) return path;
  const [head, ...tail] = path;
  if (head === "title") return ["pageTitle", ...tail];
  if (head === "description") return ["pageDescription", ...tail];
  return path;
}

/**
 * Editor rules expressed as object level refinements in the shared schema
 * only run once the rest of the object is valid; checking them here too
 * shows every problem of a question at once.
 */
function supplementalIssues(question: Question): PropertyKey[][] {
  const issues: PropertyKey[][] = [];
  if (question.type === "hotspot" && !question.media?.imageId) issues.push(["media", "imageId"]);
  if (question.type === "music") {
    if (!question.media?.audioId) issues.push(["media", "audioId"]);
    const sum = question.data.fields.reduce((acc, f) => acc + weightToThousandths(f.weight), 0);
    if (sum !== 1000) issues.push(["data", "fields"]);
  }
  if (question.type === "single" && !question.data.options.some((o) => o.id === question.data.correctId)) {
    issues.push(["data", "correctId"]);
  }
  if (question.type === "multi" && question.data.correctIds.length === 0) issues.push(["data", "correctIds"]);
  return issues;
}

/** Validates the whole draft with the shared Zod schema and maps issues to inline messages. */
export function validateQuiz(draft: QuizUpdateRequest): QuizValidation {
  const result = quizUpdateRequestSchema.safeParse(draft);
  const quiz: ErrorMap = {};
  const questions: Record<string, ErrorMap> = {};

  const questionMap = (index: number): ErrorMap | null => {
    const id = draft.questions[index]?.id;
    if (id === undefined) return null;
    return (questions[id] ??= {});
  };

  if (!result.success) {
    for (const issue of result.error.issues) {
      const [head, index, ...rest] = issue.path;
      if (head === "questions" && typeof index === "number") {
        const map = questionMap(index);
        if (map) add(map, rest.length > 0 ? pagePath(draft.questions[index], rest) : ["type"]);
      } else {
        add(quiz, issue.path.length > 0 ? [issue.path[0] ?? "title"] : ["title"]);
      }
    }
  }

  draft.questions.forEach((question, index) => {
    if (isPage(question)) return;
    const extra = supplementalIssues(question);
    if (extra.length === 0) return;
    const map = questionMap(index);
    if (map) for (const path of extra) add(map, path);
  });

  const valid = result.success && Object.keys(questions).length === 0;
  return { valid, quiz, questions };
}
