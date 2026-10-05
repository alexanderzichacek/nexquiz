import { z } from "zod";
import { idSchema, localIdSchema } from "./common.js";

export const QUESTION_TYPES = ["single", "multi", "order", "hotspot", "text", "music"] as const;
export const questionTypeSchema = z.enum(QUESTION_TYPES);
export type QuestionType = z.infer<typeof questionTypeSchema>;

/** Limits from LOGIC.md "Validácia a limity" and the editor description. */
export const LIMITS = {
  timeLimit: { min: 5, max: 120, default: 30 },
  points: { min: 0, max: 1000, default: 1 },
  prompt: { max: 300 },
  optionText: { max: 120 },
  choiceOptions: { min: 2, max: 6 },
  orderItems: { min: 3, max: 8 },
  hotspotTargets: { min: 1, max: 10 },
  textAnswer: { max: 100 },
  alias: { max: 100 },
  aliases: { max: 50 },
  fieldLabel: { max: 40 },
  clip: { maxStart: 3600, minDuration: 1, maxDuration: 120 },
  quizTitle: { max: 120 },
  quizDescription: { max: 1000 },
  questions: { max: 200 },
} as const;

/** Text tolerance for fuzzy matching (`text`, `music`). */
export const TOLERANCES = ["strict", "normal", "loose"] as const;
export const toleranceSchema = z.enum(TOLERANCES);
export type Tolerance = z.infer<typeof toleranceSchema>;

/** Scoring mode for `multi` and `order`. */
export const SCORING_MODES = ["partial", "all"] as const;
export const scoringModeSchema = z.enum(SCORING_MODES);
export type ScoringMode = z.infer<typeof scoringModeSchema>;

/** Returns true when `value` has at most `decimals` decimal places. */
export function hasMaxDecimals(value: number, decimals: number): boolean {
  const factor = 10 ** decimals;
  const scaled = value * factor;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Converts a field weight (max. 3 decimals) to integer thousandths. */
export function weightToThousandths(weight: number): number {
  return Math.round(weight * 1000);
}

function uniqueIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((i) => i.id)).size === items.length;
}

export const optionSchema = z.object({
  id: localIdSchema,
  text: z.string().trim().min(1).max(LIMITS.optionText.max),
});
export type Option = z.infer<typeof optionSchema>;

export const mediaRefSchema = z.object({
  imageId: idSchema.optional(),
  audioId: idSchema.optional(),
});
export type MediaRef = z.infer<typeof mediaRefSchema>;

// ---------------------------------------------------------------------------
// Type-specific data
// ---------------------------------------------------------------------------

const choiceOptionsSchema = z
  .array(optionSchema)
  .min(LIMITS.choiceOptions.min)
  .max(LIMITS.choiceOptions.max)
  .refine(uniqueIds, { message: "Option ids must be unique" });

export const singleDataSchema = z
  .object({
    options: choiceOptionsSchema,
    correctId: localIdSchema,
  })
  .refine((d) => d.options.some((o) => o.id === d.correctId), {
    message: "correctId must reference one of the options",
    path: ["correctId"],
  });
export type SingleData = z.infer<typeof singleDataSchema>;

export const multiDataSchema = z
  .object({
    options: choiceOptionsSchema,
    correctIds: z.array(localIdSchema).min(1),
    scoring: scoringModeSchema,
  })
  .refine((d) => new Set(d.correctIds).size === d.correctIds.length, {
    message: "correctIds must be unique",
    path: ["correctIds"],
  })
  .refine((d) => d.correctIds.every((id) => d.options.some((o) => o.id === id)), {
    message: "correctIds must reference options",
    path: ["correctIds"],
  });
export type MultiData = z.infer<typeof multiDataSchema>;

export const orderDataSchema = z.object({
  /** Items in the CORRECT order. */
  items: z
    .array(optionSchema)
    .min(LIMITS.orderItems.min)
    .max(LIMITS.orderItems.max)
    .refine(uniqueIds, { message: "Item ids must be unique" }),
  scoring: scoringModeSchema,
});
export type OrderData = z.infer<typeof orderDataSchema>;

/** Unit interval coordinate (0–1) relative to image width / height. */
const unitSchema = z.number().min(0).max(1);

export const hotspotTargetSchema = z.object({
  shape: z.literal("circle"),
  x: unitSchema,
  y: unitSchema,
  /** Radius as a fraction of the image WIDTH. */
  r: z.number().gt(0).max(1),
});
export type HotspotTarget = z.infer<typeof hotspotTargetSchema>;

export const hotspotDataSchema = z.object({
  targets: z.array(hotspotTargetSchema).min(LIMITS.hotspotTargets.min).max(LIMITS.hotspotTargets.max),
});
export type HotspotData = z.infer<typeof hotspotDataSchema>;

const aliasesSchema = z
  .array(z.string().trim().min(1).max(LIMITS.alias.max))
  .min(1)
  .max(LIMITS.aliases.max);

const fieldLabelSchema = z.string().trim().max(LIMITS.fieldLabel.max).optional();

const weightSchema = z
  .number()
  .gt(0)
  .max(1)
  .refine((w) => hasMaxDecimals(w, 3), { message: "Weight may have at most 3 decimals" });

export const textFieldSchema = z.object({
  key: z.literal("answer"),
  label: fieldLabelSchema,
  weight: z.literal(1),
  accepted: aliasesSchema,
});
export type TextField = z.infer<typeof textFieldSchema>;

export const textDataSchema = z.object({
  fields: z.tuple([textFieldSchema]),
  tolerance: toleranceSchema,
});
export type TextData = z.infer<typeof textDataSchema>;

export const musicArtistFieldSchema = z.object({
  key: z.literal("artist"),
  label: fieldLabelSchema,
  weight: weightSchema,
  accepted: aliasesSchema,
});
export const musicTitleFieldSchema = z.object({
  key: z.literal("title"),
  label: fieldLabelSchema,
  weight: weightSchema,
  accepted: aliasesSchema,
});
export type MusicField = z.infer<typeof musicArtistFieldSchema> | z.infer<typeof musicTitleFieldSchema>;

export const clipSchema = z.object({
  start: z.number().min(0).max(LIMITS.clip.maxStart),
  duration: z.number().min(LIMITS.clip.minDuration).max(LIMITS.clip.maxDuration),
});
export type Clip = z.infer<typeof clipSchema>;

export const musicDataSchema = z
  .object({
    clip: clipSchema,
    fields: z.tuple([musicArtistFieldSchema, musicTitleFieldSchema]),
    tolerance: toleranceSchema,
  })
  .refine((d) => d.fields.reduce((sum, f) => sum + weightToThousandths(f.weight), 0) === 1000, {
    message: "Field weights must sum to 1",
    path: ["fields"],
  });
export type MusicData = z.infer<typeof musicDataSchema>;

/** Any text-like field (shared by `text` and `music`). */
export type AnswerField = TextField | MusicField;
export type FieldKey = AnswerField["key"];

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

const questionBaseShape = {
  id: idSchema,
  prompt: z.string().trim().min(1).max(LIMITS.prompt.max),
  media: mediaRefSchema.optional(),
  timeLimit: z.number().int().min(LIMITS.timeLimit.min).max(LIMITS.timeLimit.max),
  points: z
    .number()
    .min(LIMITS.points.min)
    .max(LIMITS.points.max)
    .refine((p) => hasMaxDecimals(p, 2), { message: "Points may have at most 2 decimals" }),
};

export const singleQuestionSchema = z.object({
  ...questionBaseShape,
  type: z.literal("single"),
  data: singleDataSchema,
});

export const multiQuestionSchema = z.object({
  ...questionBaseShape,
  type: z.literal("multi"),
  data: multiDataSchema,
});

export const orderQuestionSchema = z.object({
  ...questionBaseShape,
  type: z.literal("order"),
  data: orderDataSchema,
});

export const hotspotQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("hotspot"),
    data: hotspotDataSchema,
  })
  .refine((q) => q.media?.imageId !== undefined, {
    message: "Hotspot question requires an image",
    path: ["media", "imageId"],
  });

export const textQuestionSchema = z.object({
  ...questionBaseShape,
  type: z.literal("text"),
  data: textDataSchema,
});

export const musicQuestionSchema = z
  .object({
    ...questionBaseShape,
    type: z.literal("music"),
    data: musicDataSchema,
  })
  .refine((q) => q.media?.audioId !== undefined, {
    message: "Music question requires audio",
    path: ["media", "audioId"],
  });

/** A question validated with all editor rules (LOGIC.md "Validácia a limity"). */
export const questionSchema = z.discriminatedUnion("type", [
  singleQuestionSchema,
  multiQuestionSchema,
  orderQuestionSchema,
  hotspotQuestionSchema,
  textQuestionSchema,
  musicQuestionSchema,
]);
export type Question = z.infer<typeof questionSchema>;
export type QuestionOf<T extends QuestionType> = Extract<Question, { type: T }>;
export type SingleQuestion = QuestionOf<"single">;
export type MultiQuestion = QuestionOf<"multi">;
export type OrderQuestion = QuestionOf<"order">;
export type HotspotQuestion = QuestionOf<"hotspot">;
export type TextQuestion = QuestionOf<"text">;
export type MusicQuestion = QuestionOf<"music">;

// ---------------------------------------------------------------------------
// Quiz
// ---------------------------------------------------------------------------

export const DEFAULT_QUIZ_SETTINGS = {
  speedBonus: true,
  showLeaderboardAfterEach: true,
  shuffleOptions: false,
} as const;

export const quizSettingsSchema = z.object({
  speedBonus: z.boolean().default(DEFAULT_QUIZ_SETTINGS.speedBonus),
  showLeaderboardAfterEach: z.boolean().default(DEFAULT_QUIZ_SETTINGS.showLeaderboardAfterEach),
  shuffleOptions: z.boolean().default(DEFAULT_QUIZ_SETTINGS.shuffleOptions),
});
export type QuizSettings = z.infer<typeof quizSettingsSchema>;

export const quizTitleSchema = z.string().trim().min(1).max(LIMITS.quizTitle.max);
export const quizDescriptionSchema = z.string().trim().max(LIMITS.quizDescription.max).nullable();

export const quizQuestionsSchema = z
  .array(questionSchema)
  .max(LIMITS.questions.max)
  .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, {
    message: "Question ids must be unique",
  });

/** A complete quiz as edited and saved (questions in their final order). */
export const quizSchema = z.object({
  id: idSchema,
  title: quizTitleSchema,
  description: quizDescriptionSchema,
  settings: quizSettingsSchema,
  questions: quizQuestionsSchema,
});
export type Quiz = z.infer<typeof quizSchema>;

/** Image dimensions needed by the hotspot scorer (from `media.width/height`). */
export const imageSizeSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});
export type ImageSize = z.infer<typeof imageSizeSchema>;

/**
 * Snapshot of a quiz taken at game start (Redis `game:{pin}:quiz`, Postgres
 * `games.quiz_snapshot`). Contains correct answers – server only.
 */
export const quizSnapshotSchema = quizSchema.extend({
  /** Image sizes by media id, used for hotspot aspect ratio. */
  images: z.record(z.string(), imageSizeSchema).default({}),
  takenAt: z.number().int(),
});
export type QuizSnapshot = z.infer<typeof quizSnapshotSchema>;
