import { z } from "zod";
import { localIdSchema } from "./common.js";
import { LIMITS, numberValueSchema, type Question, type QuestionType } from "./question.js";

const textInputSchema = z.string().trim().max(LIMITS.textAnswer.max);

export const singleAnswerSchema = z.object({ optionId: localIdSchema });
export type SingleAnswer = z.infer<typeof singleAnswerSchema>;

export const multiAnswerSchema = z.object({
  optionIds: z.array(localIdSchema).min(1).max(LIMITS.choiceOptions.max),
});
export type MultiAnswer = z.infer<typeof multiAnswerSchema>;

export const orderAnswerSchema = z.object({
  order: z.array(localIdSchema).min(LIMITS.orderItems.min).max(LIMITS.orderItems.max),
});
export type OrderAnswer = z.infer<typeof orderAnswerSchema>;

export const hotspotAnswerSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export type HotspotAnswer = z.infer<typeof hotspotAnswerSchema>;

export const textAnswerSchema = z.object({
  answers: z.object({ answer: textInputSchema }),
});
export type TextAnswer = z.infer<typeof textAnswerSchema>;

export const musicAnswerSchema = z.object({
  answers: z.object({ artist: textInputSchema, title: textInputSchema }),
});
export type MusicAnswer = z.infer<typeof musicAnswerSchema>;

export const numberAnswerSchema = z.object({ value: numberValueSchema });
export type NumberAnswer = z.infer<typeof numberAnswerSchema>;

export const answerPayloadSchemas = {
  single: singleAnswerSchema,
  multi: multiAnswerSchema,
  order: orderAnswerSchema,
  hotspot: hotspotAnswerSchema,
  text: textAnswerSchema,
  music: musicAnswerSchema,
  number: numberAnswerSchema,
} as const satisfies Record<QuestionType, z.ZodType>;

export type AnswerPayloadMap = {
  [K in QuestionType]: z.infer<(typeof answerPayloadSchemas)[K]>;
};
export type AnswerPayload = AnswerPayloadMap[QuestionType];

/** An answer payload tagged with the question type it belongs to. */
export const taggedAnswerSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("single"), payload: singleAnswerSchema }),
  z.object({ type: z.literal("multi"), payload: multiAnswerSchema }),
  z.object({ type: z.literal("order"), payload: orderAnswerSchema }),
  z.object({ type: z.literal("hotspot"), payload: hotspotAnswerSchema }),
  z.object({ type: z.literal("text"), payload: textAnswerSchema }),
  z.object({ type: z.literal("music"), payload: musicAnswerSchema }),
  z.object({ type: z.literal("number"), payload: numberAnswerSchema }),
]);
export type TaggedAnswer = z.infer<typeof taggedAnswerSchema>;

/**
 * Validates a raw `player:answer` payload against a concrete question:
 * Zod shape per type, and that every referenced id belongs to the question
 * (`order` must be a permutation of the items). Returns `null` when invalid.
 */
export function parseAnswerPayload(question: Question, raw: unknown): TaggedAnswer | null {
  switch (question.type) {
    case "single": {
      const r = singleAnswerSchema.safeParse(raw);
      if (!r.success) return null;
      if (!question.data.options.some((o) => o.id === r.data.optionId)) return null;
      return { type: "single", payload: r.data };
    }
    case "multi": {
      const r = multiAnswerSchema.safeParse(raw);
      if (!r.success) return null;
      const ids = new Set(question.data.options.map((o) => o.id));
      if (new Set(r.data.optionIds).size !== r.data.optionIds.length) return null;
      if (!r.data.optionIds.every((id) => ids.has(id))) return null;
      return { type: "multi", payload: r.data };
    }
    case "order": {
      const r = orderAnswerSchema.safeParse(raw);
      if (!r.success) return null;
      if (!isPermutation(r.data.order, question.data.items.map((i) => i.id))) return null;
      return { type: "order", payload: r.data };
    }
    case "hotspot": {
      const r = hotspotAnswerSchema.safeParse(raw);
      return r.success ? { type: "hotspot", payload: r.data } : null;
    }
    case "text": {
      const r = textAnswerSchema.safeParse(raw);
      return r.success ? { type: "text", payload: r.data } : null;
    }
    case "music": {
      const r = musicAnswerSchema.safeParse(raw);
      return r.success ? { type: "music", payload: r.data } : null;
    }
    case "number": {
      const r = numberAnswerSchema.safeParse(raw);
      return r.success ? { type: "number", payload: r.data } : null;
    }
  }
}

/** True when `candidate` contains exactly the ids of `reference`, each once. */
export function isPermutation(candidate: readonly string[], reference: readonly string[]): boolean {
  if (candidate.length !== reference.length) return false;
  const remaining = new Set(reference);
  if (remaining.size !== reference.length) return false;
  for (const id of candidate) {
    if (!remaining.delete(id)) return false;
  }
  return remaining.size === 0;
}
