/** Whole number with a non-breaking space between thousands (`12 450`). */
function groupThousands(whole: number): string {
  return String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, "\u00A0");
}

/** Number formatting of scores, as in DESIGN.md (`1 250`, `+850`): scores are whole points. */
export function formatScore(value: number): string {
  const whole = Math.round(value);
  return `${whole < 0 ? "−" : ""}${groupThousands(Math.abs(whole))}`;
}

export function formatDelta(value: number): string {
  return `${value >= 0 ? "+" : "−"}${groupThousands(Math.abs(Math.round(value)))}`;
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
