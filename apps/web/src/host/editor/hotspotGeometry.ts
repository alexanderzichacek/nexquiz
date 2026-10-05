/** Geometry of the hotspot editor. Coordinates are 0–1, `r` is a fraction of the image WIDTH. */

export const MIN_RADIUS = 0.01;
export const MAX_RADIUS = 0.5;
export const DEFAULT_RADIUS = 0.06;
/** Keyboard step for moving / resizing a target. */
export const KEY_STEP = 0.01;
export const KEY_STEP_LARGE = 0.05;

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Rounds to 4 decimals (sub-pixel precision even on 1920 px images). */
export function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** Client coordinates → normalized image coordinates (clamped to 0–1). */
export function toImagePoint(rect: Rect, clientX: number, clientY: number): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: round4(clamp((clientX - rect.left) / rect.width, 0, 1)),
    y: round4(clamp((clientY - rect.top) / rect.height, 0, 1)),
  };
}

/**
 * Radius (in width units) of a circle centered at `center` passing through
 * `point`. `aspect` is height / width, so the circle stays round on
 * non-square images (same math as the server `inCircle`).
 */
export function radiusThrough(center: Point, point: Point, aspect: number): number {
  const dx = point.x - center.x;
  const dy = (point.y - center.y) * aspect;
  return round4(clamp(Math.sqrt(dx * dx + dy * dy), MIN_RADIUS, MAX_RADIUS));
}
