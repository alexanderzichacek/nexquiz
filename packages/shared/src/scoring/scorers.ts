import type {
  HotspotAnswer,
  MultiAnswer,
  SingleAnswer,
  TaggedAnswer,
} from "../schemas/answer.js";
import {
  weightToThousandths,
  type AnswerField,
  type FieldKey,
  type HotspotTarget,
  type MultiData,
  type Question,
  type ScoringMode,
  type SingleData,
  type Tolerance,
} from "../schemas/question.js";
import { fraction, ONE, ZERO, type Fraction } from "./fraction.js";
import { matchesNormalized } from "./fuzzy.js";
import { normalize } from "./normalize.js";
import { numberScore } from "./number.js";

/** `single`: 1 when the chosen option is the correct one. */
export function singleScore(answer: SingleAnswer, data: Pick<SingleData, "correctId">): Fraction {
  return answer.optionId === data.correctId ? ONE : ZERO;
}

/**
 * `multi`:
 * - `all`: 1 only when the sets match exactly,
 * - `partial`: `max(0, (hits − 0.5 × wrongly selected) / correctIds.length)`,
 *   so a wrong pick costs half of a hit instead of cancelling it.
 */
export function multiScore(answer: MultiAnswer, data: Pick<MultiData, "correctIds" | "scoring">): Fraction {
  const correct = new Set(data.correctIds);
  const chosen = new Set(answer.optionIds);
  if (correct.size === 0) return ZERO;
  let hits = 0;
  let wrong = 0;
  for (const id of chosen) {
    if (correct.has(id)) hits++;
    else wrong++;
  }
  if (data.scoring === "all") {
    return hits === correct.size && wrong === 0 ? ONE : ZERO;
  }
  if (wrong === 0) return fraction(hits, correct.size);
  // Exact fraction without floats: (2·hits − wrong) / (2·|correct|).
  const num = 2 * hits - wrong;
  return num > 0 ? fraction(num, 2 * correct.size) : ZERO;
}

/**
 * `order`: `all` → 1 only for the exact order; `partial` → normalized Kendall
 * tau clipped at 0 (a random order has an expected score of 0).
 * `correct` is the list of item ids in the correct order. An answer that is
 * not a permutation of `correct` scores 0.
 */
export function orderScore(answer: readonly string[], correct: readonly string[], mode: ScoringMode = "partial"): Fraction {
  const pos = new Map(answer.map((id, i) => [id, i]));
  if (answer.length !== correct.length || pos.size !== correct.length) return ZERO;
  if (!correct.every((id) => pos.has(id))) return ZERO;

  if (mode === "all") {
    return correct.every((id, i) => answer[i] === id) ? ONE : ZERO;
  }

  let concordant = 0;
  let total = 0;
  for (let i = 0; i < correct.length; i++) {
    for (let j = i + 1; j < correct.length; j++) {
      total++;
      const pi = pos.get(correct[i] ?? "") ?? -1;
      const pj = pos.get(correct[j] ?? "") ?? -1;
      if (pi < pj) concordant++;
    }
  }
  if (total === 0) return ONE;
  // tau = (2·concordant − total) / total, clipped at 0
  return fraction(Math.max(0, 2 * concordant - total), total);
}

export interface Point {
  x: number;
  y: number;
}

/**
 * True when point `p` lies inside circle `t`. Coordinates are normalized to
 * image width / height (0–1) and `r` is a fraction of the image width;
 * `aspect = height / width` converts the y axis to width units so the circle
 * stays a circle on non-square images.
 */
export function inCircle(p: Point, t: Pick<HotspotTarget, "x" | "y" | "r">, aspect: number): boolean {
  const dx = p.x - t.x;
  const dy = (p.y - t.y) * aspect;
  return dx * dx + dy * dy <= t.r * t.r;
}

/** `hotspot`: 1 when the tap lies inside any target. */
export function hotspotScore(answer: HotspotAnswer, targets: readonly HotspotTarget[], aspect: number): Fraction {
  return targets.some((t) => inCircle(answer, t, aspect)) ? ONE : ZERO;
}

/**
 * Host override lookup: returns `true` / `false` when the host manually
 * accepted / rejected the normalized answer of a field, `undefined` otherwise.
 * Overrides take precedence over automatic matching.
 */
export type OverrideLookup = (fieldKey: FieldKey, normalized: string) => boolean | undefined;

export interface FieldsScore {
  correctness: Fraction;
  /** Whether each field was accepted. */
  perField: Record<string, boolean>;
  /** Normalized input per field (used for grouping and overrides). */
  normalized: Record<string, string>;
}

/**
 * `text` / `music`: each field is evaluated separately and
 * `correctness = Σ weight` of the matching fields (exact, in thousandths).
 */
export function fieldsScore(
  answers: Readonly<Record<string, string>>,
  fields: readonly AnswerField[],
  tolerance: Tolerance,
  override?: OverrideLookup,
): FieldsScore {
  let thousandths = 0;
  const perField: Record<string, boolean> = {};
  const normalizedByField: Record<string, string> = {};
  for (const field of fields) {
    const normalizedInput = normalize(answers[field.key] ?? "");
    normalizedByField[field.key] = normalizedInput;
    const manual = normalizedInput ? override?.(field.key, normalizedInput) : undefined;
    const ok =
      manual ??
      (normalizedInput !== "" &&
        field.accepted.some((alias) => matchesNormalized(normalizedInput, normalize(alias), tolerance)));
    perField[field.key] = ok;
    if (ok) thousandths += weightToThousandths(field.weight);
  }
  return {
    correctness: fraction(Math.min(thousandths, 1000), 1000),
    perField,
    normalized: normalizedByField,
  };
}

/** `text` scorer (single field `answer`). */
export const textScore = fieldsScore;
/** `music` scorer – same as `text`, with weighted `artist` / `title` fields. */
export const musicScore = fieldsScore;

export interface ScoreContext {
  /** `height / width` of the hotspot image; defaults to 1. */
  imageAspect?: number;
  override?: OverrideLookup;
  /** `number` in `closest` mode: the smallest distance of any answer of the question (see `closestDistance`). */
  closestDistance?: number | null;
}

export interface ScoreResult {
  correctness: Fraction;
  perField?: Record<string, boolean>;
  normalized?: Record<string, string>;
}

/**
 * Scores a validated answer against its question (server only). An answer
 * whose type does not match the question scores 0.
 */
export function scoreAnswer(question: Question, answer: TaggedAnswer, ctx: ScoreContext = {}): ScoreResult {
  switch (question.type) {
    case "single":
      return { correctness: answer.type === "single" ? singleScore(answer.payload, question.data) : ZERO };
    case "multi":
      return { correctness: answer.type === "multi" ? multiScore(answer.payload, question.data) : ZERO };
    case "order":
      return {
        correctness:
          answer.type === "order"
            ? orderScore(
                answer.payload.order,
                question.data.items.map((i) => i.id),
                question.data.scoring,
              )
            : ZERO,
      };
    case "hotspot":
      return {
        correctness:
          answer.type === "hotspot"
            ? hotspotScore(answer.payload, question.data.targets, ctx.imageAspect ?? 1)
            : ZERO,
      };
    case "text": {
      if (answer.type !== "text") return { correctness: ZERO };
      return textScore(answer.payload.answers, question.data.fields, question.data.tolerance, ctx.override);
    }
    case "music": {
      if (answer.type !== "music") return { correctness: ZERO };
      return musicScore(answer.payload.answers, question.data.fields, question.data.tolerance, ctx.override);
    }
    case "number":
      return {
        correctness:
          answer.type === "number" ? numberScore(answer.payload.value, question.data, ctx.closestDistance) : ZERO,
      };
  }
}
