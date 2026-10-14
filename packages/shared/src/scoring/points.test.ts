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
  // Questions are worth 1000 points by default; the result is a whole number.
  const base = { points: 1000, correctness: ONE, answeredMs: 0, timeLimitMs: 30_000, speedBonus: true };

  it("points × correctness × speedFactor", () => {
    expect(computePoints(base)).toBe(1000);
    expect(computePoints({ ...base, answeredMs: 15_000 })).toBe(750);
    expect(computePoints({ ...base, answeredMs: 30_000 })).toBe(500);
    expect(computePoints({ ...base, points: 2000, answeredMs: 30_000 })).toBe(1000);
  });

  it("returns 0 for zero correctness regardless of speed", () => {
    expect(computePoints({ ...base, correctness: ZERO })).toBe(0);
  });

  it("ignores speed without speed bonus", () => {
    expect(computePoints({ ...base, answeredMs: 29_999, speedBonus: false })).toBe(1000);
  });

  it("rounds once to a whole point, half up", () => {
    // 1000 × 1/3 × 1 = 333.33…
    expect(computePoints({ ...base, correctness: fraction(1, 3) })).toBe(333);
    // 1000 × 1/2 × 5/6 = 416.66…
    expect(computePoints({ ...base, correctness: fraction(1, 2), answeredMs: 10_000 })).toBe(417);
    // 1 × 1/2 = 0.5 → 1 (half up)
    expect(computePoints({ ...base, points: 1, correctness: fraction(1, 2) })).toBe(1);
    // 999 × 1/2 = 499.5 → 500
    expect(computePoints({ ...base, points: 999, correctness: fraction(1, 2) })).toBe(500);
    // 1 point with the slowest speed factor: 0.5 → 1, 0.49 would be 0
    expect(computePoints({ ...base, points: 1, answeredMs: 30_000 })).toBe(1);
  });

  it("is exact where naive float math would round down (2.01 × 0.5 = 1.005)", () => {
    expect(Math.round(2.01 * 0.5 * 100) / 100).toBe(1); // naive float result is wrong
    // 2.01 × 1/2 = 1.005 → 1 whole point; 1001.01 × 1/2 = 500.505 → 501
    expect(computePoints({ ...base, points: 1001.01, correctness: fraction(1, 2) })).toBe(501);
  });

  it("music: half of the points for one of two fields", () => {
    expect(computePoints({ ...base, correctness: fraction(500, 1000), speedBonus: false })).toBe(500);
  });

  it("returns whole points as multiples of 100 hundredths", () => {
    // 1000 × (60000 − 1) / 60000 = 999.98… → 1000
    expect(computePointsHundredths({ ...base, answeredMs: 1 })).toBe(100_000);
    expect(computePointsHundredths({ ...base, answeredMs: 15_000 }) % 100).toBe(0);
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

describe("speedFactor – boundaries", () => {
  it("is an exact fraction (2T − a) / 2T", () => {
    expect(speedFactor(10_000, 30_000, true)).toEqual({ num: 50_000, den: 60_000 });
    expect(speedFactor(0, 30_000, true)).toEqual({ num: 60_000, den: 60_000 });
  });

  it("is 0.5 from exactly the time limit on, also 1 ms after it", () => {
    expect(speedFactor(30_000, 30_000, true)).toEqual({ num: 30_000, den: 60_000 });
    expect(speedFactor(30_001, 30_000, true)).toEqual({ num: 30_000, den: 60_000 });
    expect(speedFactor(29_999, 30_000, true)).toEqual({ num: 30_001, den: 60_000 });
  });

  it("floors fractional milliseconds", () => {
    expect(speedFactor(1.9, 30_000, true)).toEqual({ num: 59_999, den: 60_000 });
  });

  it("guards a zero time limit (no division by zero)", () => {
    expect(fractionToNumber(speedFactor(0, 0, true))).toBe(1);
    expect(fractionToNumber(speedFactor(5_000, 0, true))).toBe(0.5);
  });
});

describe("computePoints – boundaries and precision", () => {
  const base = { points: 1000, correctness: ONE, answeredMs: 0, timeLimitMs: 10_000, speedBonus: true };

  it("speed bonus: 1000 at 0 ms, 500 at and after the time limit", () => {
    expect(computePoints({ ...base, answeredMs: 0 })).toBe(1000);
    expect(computePoints({ ...base, answeredMs: 10_000 })).toBe(500);
    expect(computePoints({ ...base, answeredMs: 10_001 })).toBe(500);
    expect(computePoints({ ...base, answeredMs: 60_000 })).toBe(500);
  });

  it("speed bonus off: full points at any time, also after the time limit", () => {
    expect(computePoints({ ...base, answeredMs: 0, speedBonus: false })).toBe(1000);
    expect(computePoints({ ...base, answeredMs: 10_300, speedBonus: false })).toBe(1000);
  });

  it("zero correctness is 0 points with and without speed bonus", () => {
    expect(computePoints({ ...base, correctness: ZERO, speedBonus: false })).toBe(0);
    expect(computePoints({ ...base, correctness: fraction(0, 6), answeredMs: 10_000 })).toBe(0);
    expect(computePointsHundredths({ ...base, correctness: ZERO })).toBe(0);
  });

  it("combines partial correctness with the speed factor exactly", () => {
    // order: one swap (2/3) at half time (3/4) → 1000 × 2/3 × 3/4 = 500
    expect(computePoints({ ...base, correctness: fraction(4, 6), answeredMs: 5_000 })).toBe(500);
    // 1000 × 1/3 × 1/2 = 166.66… → 167
    expect(computePoints({ ...base, correctness: fraction(1, 3), answeredMs: 10_000 })).toBe(167);
    // 1000 × 2/3 = 666.66… → 667
    expect(computePoints({ ...base, correctness: fraction(2, 3), speedBonus: false })).toBe(667);
    // music 0.333 × 1000 = 333
    expect(computePoints({ ...base, correctness: fraction(333, 1000), speedBonus: false })).toBe(333);
  });

  it("rounds half up exactly at .5 and down just below it", () => {
    // 3 × 1/2 = 1.5 → 2
    expect(computePoints({ ...base, points: 3, correctness: fraction(1, 2), speedBonus: false })).toBe(2);
    // 5 × 3/4 (half time) = 3.75 → 4; 5 × 1/2 × 3/4 = 1.875 → 2
    expect(computePoints({ ...base, points: 5, answeredMs: 5_000 })).toBe(4);
    expect(computePoints({ ...base, points: 5, correctness: fraction(1, 2), answeredMs: 5_000 })).toBe(2);
    // 999.98 × 1/2 = 499.99 → 500; 998.98 × 1/2 = 499.49 → 499
    expect(computePoints({ ...base, points: 999.98, correctness: fraction(1, 2), speedBonus: false })).toBe(500);
    expect(computePoints({ ...base, points: 998.98, correctness: fraction(1, 2), speedBonus: false })).toBe(499);
    // 1000 × (20000 − 1) / 20000 = 999.95 → 1000; × (20000 − 11) / 20000 = 999.45 → 999
    expect(computePoints({ ...base, answeredMs: 1 })).toBe(1000);
    expect(computePoints({ ...base, answeredMs: 11 })).toBe(999);
  });

  it("handles the maximum points (9999.99) and long time limits without overflow", () => {
    expect(computePoints({ ...base, points: 9999.99, speedBonus: false })).toBe(10_000);
    expect(computePoints({ ...base, points: 9999, correctness: fraction(999, 1000), answeredMs: 119_999, timeLimitMs: 120_000 })).toBe(
      4995,
    );
  });

  it("sums of many answers stay exact in hundredths", () => {
    const perAnswer = computePointsHundredths({ ...base, correctness: fraction(1, 3), speedBonus: false });
    expect(perAnswer).toBe(33_300);
    expect(fromHundredths(perAnswer * 200)).toBe(66_600);
  });
});
