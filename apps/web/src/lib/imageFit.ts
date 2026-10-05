/**
 * Geometry of an `<img>` rendered with `object-fit: contain`: the visible
 * image is centered inside the element box with letterboxing. Hotspot
 * coordinates are normalized (0–1) to the DISPLAYED image, not the box.
 */
export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface UnitPoint {
  x: number;
  y: number;
}

/** Visible image rect inside `box` (coordinates relative to the box). */
export function containRect(box: Size, natural: Size): Rect {
  if (box.width <= 0 || box.height <= 0 || natural.width <= 0 || natural.height <= 0) {
    return { left: 0, top: 0, width: Math.max(0, box.width), height: Math.max(0, box.height) };
  }
  const scale = Math.min(box.width / natural.width, box.height / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;
  return { left: (box.width - width) / 2, top: (box.height - height) / 2, width, height };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Rounded to 4 decimals (sub-pixel precision even on 1920 px images). */
function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Point relative to the box → normalized image coordinates, or `null` when
 * it lies in the letterbox outside the visible image.
 */
export function toUnitPoint(image: Rect, px: number, py: number): UnitPoint | null {
  if (image.width <= 0 || image.height <= 0) return null;
  const x = (px - image.left) / image.width;
  const y = (py - image.top) / image.height;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x: round4(x), y: round4(y) };
}

/** Like `toUnitPoint`, but clamps to the image edge (dragging a marker). */
export function toClampedUnitPoint(image: Rect, px: number, py: number): UnitPoint {
  if (image.width <= 0 || image.height <= 0) return { x: 0, y: 0 };
  return {
    x: round4(clamp01((px - image.left) / image.width)),
    y: round4(clamp01((py - image.top) / image.height)),
  };
}

/** Normalized point → position relative to the box (for rendering markers). */
export function fromUnitPoint(image: Rect, p: UnitPoint): { left: number; top: number } {
  return { left: image.left + p.x * image.width, top: image.top + p.y * image.height };
}
