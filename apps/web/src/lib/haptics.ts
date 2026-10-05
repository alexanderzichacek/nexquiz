/** Player haptics (DESIGN.md "Pohyb a zvuk"): players have no sounds, only vibration. */
export const HAPTIC_SUBMIT = 30;
/** Two pulses for a wrong answer. */
export const HAPTIC_WRONG: readonly number[] = [60, 80, 60];

export function vibrate(pattern: number | readonly number[]): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
  } catch {
    // Unsupported or blocked – haptics are optional.
  }
}
