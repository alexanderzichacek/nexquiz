import { describe, expect, it } from "vitest";
import { MAX_RADIUS, MIN_RADIUS, radiusThrough, toImagePoint } from "./hotspotGeometry";

describe("toImagePoint", () => {
  const rect = { left: 100, top: 50, width: 400, height: 200 };

  it("normalizes client coordinates to 0–1", () => {
    expect(toImagePoint(rect, 300, 150)).toEqual({ x: 0.5, y: 0.5 });
    expect(toImagePoint(rect, 100, 50)).toEqual({ x: 0, y: 0 });
  });

  it("clamps points outside the image", () => {
    expect(toImagePoint(rect, 0, 1000)).toEqual({ x: 0, y: 1 });
  });
});

describe("radiusThrough", () => {
  it("measures in width units so circles stay round on wide images", () => {
    // 2:1 image (aspect h/w = 0.5): 0.2 of the height equals 0.1 of the width.
    expect(radiusThrough({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.7 }, 0.5)).toBeCloseTo(0.1, 4);
    expect(radiusThrough({ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }, 0.5)).toBeCloseTo(0.1, 4);
  });

  it("clamps the radius", () => {
    expect(radiusThrough({ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.5 }, 1)).toBe(MIN_RADIUS);
    expect(radiusThrough({ x: 0, y: 0 }, { x: 1, y: 1 }, 1)).toBe(MAX_RADIUS);
  });
});
