import { describe, expect, it } from "vitest";
import { fraction, fractionToNumber, ONE, ZERO } from "./fraction.js";
import { computePoints, computePointsHundredths, fromHundredths, speedFactor, toHundredths } from "./points.js";

describe("speedFactor", () => {
  it("is 1 at 0 ms and 0.5 at or after the time limit", () => {
    expect(fractionToNumber(speedFactor(0, 30_000, true))).toBe(1);
    expect(fractionToNumber(speedFactor(15_000, 30_000, true))).toBe(0.75);
    expect(fractionToNumber(speedFactor(30_000, 30_000, true))).toBe(0.5);
    expect(fractionToNumber(speedFactor(45_000, 30_000, true))).toBe(0.5);
  });

  it("clamps negative times to 0", () => {
    expect(fractionToNumber(speedFactor(-50, 30_000, true))).toBe(1);
  });

  it("is always 1 without speed bonus", () => {
    expect(speedFactor(29_000, 30_000, false)).toEqual(ONE);
  });
});

describe("computePoints", () => {
  const base = { points: 1, correctness: ONE, answeredMs: 0, timeLimitMs: 30_000, speedBonus: true };

  it("points × correctness × speedFactor", () => {
    expect(computePoints(base)).toBe(1);
    expect(computePoints({ ...base, answeredMs: 15_000 })).toBe(0.75);
    expect(computePoints({ ...base, answeredMs: 30_000 })).toBe(0.5);
    expect(computePoints({ ...base, points: 2, answeredMs: 30_000 })).toBe(1);
  });

  it("returns 0 for zero correctness regardless of speed", () => {
    expect(computePoints({ ...base, correctness: ZERO })).toBe(0);
  });

  it("ignores speed without speed bonus", () => {
    expect(computePoints({ ...base, answeredMs: 29_999, speedBonus: false })).toBe(1);
  });

  it("rounds once to 2 decimals, half up", () => {
    // 1 × 1/3 × 1 = 0.333…
    expect(computePoints({ ...base, correctness: fraction(1, 3) })).toBe(0.33);
    // 1 × 1/2 × 5/6 = 0.41666…
    expect(computePoints({ ...base, correctness: fraction(1, 2), answeredMs: 10_000 })).toBe(0.42);
    // 0.25 × 1/2 = 0.125 → 0.13
    expect(computePoints({ ...base, points: 0.25, correctness: fraction(1, 2) })).toBe(0.13);
  });

  it("is exact where naive float math would round down (2.01 × 0.5 = 1.005)", () => {
    expect(Math.round(2.01 * 0.5 * 100) / 100).toBe(1); // naive float result is wrong
    expect(computePoints({ ...base, points: 2.01, correctness: fraction(1, 2) })).toBe(1.01);
  });

  it("music: 0.5 for one of two fields at points = 1", () => {
    expect(computePoints({ ...base, correctness: fraction(500, 1000), speedBonus: false })).toBe(0.5);
  });

  it("returns integer hundredths", () => {
    expect(computePointsHundredths({ ...base, points: 1000, answeredMs: 1 })).toBe(99_998);
  });
});

describe("hundredths helpers", () => {
  it("converts to and from integer hundredths", () => {
    expect(toHundredths(3.42)).toBe(342);
    expect(toHundredths(0.07)).toBe(7);
    expect(fromHundredths(342)).toBe(3.42);
    // summing in hundredths avoids float drift
    expect(fromHundredths(toHundredths(0.1) + toHundredths(0.2))).toBe(0.3);
  });
});
