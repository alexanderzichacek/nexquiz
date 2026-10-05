/** Number formatting of scores, as in DESIGN.md (`3.42`, `+0.85`). */
export function formatScore(value: number): string {
  return value.toFixed(2);
}

export function formatDelta(value: number): string {
  return `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(2)}`;
}

/** Correctness 0–1 → whole percent. */
export function formatPercent(fraction: number): number {
  return Math.round(Math.min(1, Math.max(0, fraction)) * 100);
}

/** Result category of a player's answer (✓ / ◐ / ✗). */
export type ResultKind = "correct" | "partial" | "wrong";

export function resultKind(correctness: number): ResultKind {
  if (correctness >= 1) return "correct";
  return correctness > 0 ? "partial" : "wrong";
}
