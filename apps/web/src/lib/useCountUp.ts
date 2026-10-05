import { onBeforeUnmount, ref, watch, type Ref } from "vue";
import { prefersReducedMotion } from "./motion";

/** Count-up duration of scores (DESIGN.md "Pohyb a zvuk": 600 ms). */
export const COUNT_UP_MS = 600;

/** Ease-out cubic progress for `t ∈ [0, 1]`. */
export function easeOut(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return 1 - (1 - clamped) ** 3;
}

/**
 * Animated number that counts from `from` to the current `target` and on
 * every later change from the shown value to the new target. Display only;
 * with `prefers-reduced-motion` it jumps straight to the target.
 */
export function useCountUp(target: Ref<number>, from: number): Ref<number> {
  const shown = ref(prefersReducedMotion() ? target.value : from);
  let frame = 0;

  function animate(start: number, end: number): void {
    cancelAnimationFrame(frame);
    if (prefersReducedMotion() || start === end) {
      shown.value = end;
      return;
    }
    const startedAt = performance.now();
    const step = (now: number): void => {
      const t = (now - startedAt) / COUNT_UP_MS;
      shown.value = start + (end - start) * easeOut(t);
      if (t < 1) frame = requestAnimationFrame(step);
      else shown.value = end;
    };
    frame = requestAnimationFrame(step);
  }

  watch(target, (end) => animate(shown.value, end));
  animate(shown.value, target.value);
  onBeforeUnmount(() => cancelAnimationFrame(frame));
  return shown;
}
