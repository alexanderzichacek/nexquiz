import { LIMITS, type NumberData } from "../schemas/question.js";
import { ONE, ZERO, type Fraction } from "./fraction.js";

const SCALE = 10 ** LIMITS.number.decimals;

/** A number as an exact integer count of the smallest unit (`LIMITS.number.decimals` decimals), so comparisons carry no float error. */
export function numberUnits(value: number): number {
  return Math.round(value * SCALE);
}

/** Distance between a guess and the correct number, in smallest units. */
export function numberDistance(guess: number, correct: number): number {
  return Math.abs(numberUnits(guess) - numberUnits(correct));
}

/** Smallest distance of any guess to the correct number, or `null` without guesses. */
export function closestDistance(guesses: Iterable<number>, correct: number): number | null {
  let best: number | null = null;
  for (const guess of guesses) {
    const distance = numberDistance(guess, correct);
    if (best === null || distance < best) best = distance;
  }
  return best;
}

/**
 * `number` scorer: 1 or 0.
 * - `tolerance`: 1 when the guess lies within the tolerance (inclusive).
 * - `closest`: 1 when no other guess is nearer, so everybody tied for the
 *   nearest distance (an exact hit included) scores. `closest` is the best
 *   distance over all answers of the question; without it the guess is
 *   compared only with itself.
 */
export function numberScore(guess: number, data: NumberData, closest?: number | null): Fraction {
  const distance = numberDistance(guess, data.answer);
  if (data.mode === "tolerance") return distance <= numberUnits(data.tolerance) ? ONE : ZERO;
  return distance <= (closest ?? distance) ? ONE : ZERO;
}
