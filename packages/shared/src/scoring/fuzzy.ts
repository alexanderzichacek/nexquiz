import type { Tolerance } from "../schemas/question.js";
import { normalize } from "./normalize.js";

/** Levenshtein edit distance, computed over Unicode code points. */
export function levenshtein(a: string, b: string): number {
  const x = Array.from(a);
  const y = Array.from(b);
  const dp: number[] = Array.from({ length: y.length + 1 }, (_, i) => i);
  for (let i = 1; i <= x.length; i++) {
    let prev = dp[0] ?? 0;
    dp[0] = i;
    for (let j = 1; j <= y.length; j++) {
      const tmp = dp[j] ?? 0;
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[j] = Math.min(tmp + 1, (dp[j - 1] ?? 0) + 1, prev + cost);
      prev = tmp;
    }
  }
  return dp[y.length] ?? 0;
}

/**
 * Max. allowed edit distance by alias length (after normalization):
 * `[≤ 4, 5–8, > 8]` characters.
 */
export const THRESHOLDS = {
  strict: [0, 0, 1],
  normal: [0, 1, 2],
  loose: [1, 2, 3],
} as const satisfies Record<Tolerance, readonly [number, number, number]>;

export function maxDistance(length: number, tolerance: Tolerance): number {
  const [short, mid, long] = THRESHOLDS[tolerance];
  return length <= 4 ? short : length <= 8 ? mid : long;
}

/** Compares an already normalized input with one already normalized alias. */
export function matchesNormalized(input: string, alias: string, tolerance: Tolerance): boolean {
  if (!input || !alias) return false;
  if (input === alias) return true;
  return levenshtein(input, alias) <= maxDistance(Array.from(alias).length, tolerance);
}

/**
 * True when `input` matches any accepted alias: exact match after
 * normalization or Levenshtein distance within the tolerance threshold.
 * Empty input never matches; aliases that normalize to an empty string are ignored.
 */
export function isMatch(input: string, accepted: readonly string[], tolerance: Tolerance = "normal"): boolean {
  const x = normalize(input);
  if (!x) return false;
  return accepted.some((acc) => matchesNormalized(x, normalize(acc), tolerance));
}
