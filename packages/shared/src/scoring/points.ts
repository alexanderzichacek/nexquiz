import { fraction, ONE, roundDivBig, type Fraction } from "./fraction.js";

/** Grace period after `deadline` during which answers are still accepted. */
export const ANSWER_GRACE_MS = 300;

/**
 * `speedFactor = speedBonus ? 1 − 0.5 × min(answeredMs / timeLimitMs, 1) : 1`,
 * as an exact fraction `(2T − min(a, T)) / 2T`.
 */
export function speedFactor(answeredMs: number, timeLimitMs: number, speedBonus: boolean): Fraction {
  if (!speedBonus) return ONE;
  const t = Math.max(1, Math.floor(timeLimitMs));
  const a = Math.min(Math.max(0, Math.floor(answeredMs)), t);
  return fraction(2 * t - a, 2 * t);
}

/** Converts a points value (max. 2 decimals) to integer hundredths. */
export function toHundredths(value: number): number {
  return Math.round(value * 100);
}

/** Converts integer hundredths back to a number with 2 decimals. */
export function fromHundredths(hundredths: number): number {
  return hundredths / 100;
}

export interface PointsInput {
  /** `question.points` (max. 2 decimals, 1000 by default). */
  points: number;
  correctness: Fraction;
  /** `receivedAt − questionStartedAt` (server time). */
  answeredMs: number;
  timeLimitMs: number;
  speedBonus: boolean;
}

/**
 * `points × correctness × speedFactor`, computed exactly and rounded half up
 * once to a **whole point** (scores are shown without decimals). Returned in
 * integer hundredths like every score sum, so it is always a multiple of 100.
 * Zero correctness always yields 0.
 */
export function computePointsHundredths(input: PointsInput): number {
  if (input.correctness.num === 0) return 0;
  const p = BigInt(Math.max(0, toHundredths(input.points)));
  const sf = speedFactor(input.answeredMs, input.timeLimitMs, input.speedBonus);
  const n = p * BigInt(input.correctness.num) * BigInt(sf.num);
  const d = BigInt(input.correctness.den) * BigInt(sf.den);
  // `n / d` is in hundredths of a point; dividing by 100 more yields whole points.
  return Number(roundDivBig(n, d * 100n)) * 100;
}

/** Points of one answer as a whole number (stored as `numeric(8,2)` with `.00`). */
export function computePoints(input: PointsInput): number {
  return fromHundredths(computePointsHundredths(input));
}
