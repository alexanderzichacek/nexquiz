/** `prefers-reduced-motion: reduce` for JS driven animations (count-up, confetti, podium). */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
