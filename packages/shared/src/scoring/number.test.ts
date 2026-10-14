import { describe, expect, it } from "vitest";
import type { NumberData } from "../schemas/question.js";
import { fractionToNumber } from "./fraction.js";
import { closestDistance, numberDistance, numberScore, numberUnits } from "./number.js";
import { scoreAnswer } from "./scorers.js";

const value = fractionToNumber;
const closest = (answer: number): NumberData => ({ answer, mode: "closest", tolerance: 0 });
const within = (answer: number, tolerance: number): NumberData => ({ answer, mode: "tolerance", tolerance });

describe("numberUnits / numberDistance", () => {
  it("scales to exact integers despite binary float noise", () => {
    expect(numberUnits(0.1 + 0.2)).toBe(300);
    expect(numberUnits(-1.005)).toBe(-1005);
    expect(numberDistance(2025.5, 2026)).toBe(500);
    expect(numberDistance(2026, 2025.5)).toBe(500);
  });
});

describe("closestDistance", () => {
  it("returns the smallest distance, or null without guesses", () => {
    expect(closestDistance([2020, 2030, 2027], 2026)).toBe(1000);
    expect(closestDistance([], 2026)).toBeNull();
  });
});

describe("numberScore – tolerance", () => {
  it("accepts guesses within the tolerance, bounds included", () => {
    const data = within(2026, 1);
    expect(value(numberScore(2026, data))).toBe(1);
    expect(value(numberScore(2025, data))).toBe(1);
    expect(value(numberScore(2027, data))).toBe(1);
    expect(value(numberScore(2024, data))).toBe(0);
    expect(value(numberScore(2028, data))).toBe(0);
  });

  it("tolerance 0 means an exact hit", () => {
    expect(value(numberScore(2026, within(2026, 0)))).toBe(1);
    expect(value(numberScore(2026.001, within(2026, 0)))).toBe(0);
  });

  it("is exact for decimals (0.1 + 0.2 is within 0.3 ± 0)", () => {
    expect(value(numberScore(0.1 + 0.2, within(0.3, 0)))).toBe(1);
  });

  it("ignores other answers", () => {
    expect(value(numberScore(2030, within(2026, 1), 0))).toBe(0);
  });
});

describe("numberScore – closest", () => {
  const data = closest(2026);

  it("only the nearest distance scores", () => {
    const best = closestDistance([2020, 2025, 2030], 2026);
    expect(value(numberScore(2025, data, best))).toBe(1);
    expect(value(numberScore(2020, data, best))).toBe(0);
    expect(value(numberScore(2030, data, best))).toBe(0);
  });

  it("everybody tied for the nearest distance scores, on either side of the answer", () => {
    const best = closestDistance([2025, 2027, 2030], 2026);
    expect(value(numberScore(2025, data, best))).toBe(1);
    expect(value(numberScore(2027, data, best))).toBe(1);
    expect(value(numberScore(2030, data, best))).toBe(0);
  });

  it("an exact hit beats everyone and ties with other exact hits", () => {
    const best = closestDistance([2026, 2026, 2025], 2026);
    expect(best).toBe(0);
    expect(value(numberScore(2026, data, best))).toBe(1);
    expect(value(numberScore(2025, data, best))).toBe(0);
  });

  it("a lone guess is the nearest, however far it is", () => {
    expect(value(numberScore(1, data, closestDistance([1], 2026)))).toBe(1);
    expect(value(numberScore(1, data))).toBe(1);
  });
});

describe("scoreAnswer – number", () => {
  const question = {
    id: "q",
    type: "number",
    prompt: "Year?",
    timeLimit: 20,
    points: 1000,
    data: closest(2026),
  } as const;

  it("scores a number answer and passes the closest distance through", () => {
    const answer = { type: "number", payload: { value: 2027 } } as const;
    expect(value(scoreAnswer(question, answer, { closestDistance: 1000 }).correctness)).toBe(1);
    expect(value(scoreAnswer(question, answer, { closestDistance: 0 }).correctness)).toBe(0);
  });

  it("an answer of another type scores 0", () => {
    expect(value(scoreAnswer(question, { type: "single", payload: { optionId: "a" } }).correctness)).toBe(0);
  });
});

describe("numberScore – decimals, negatives and limits", () => {
  it("tolerance bounds with decimals are exact (|3.4 − 3.5| is 0.1000…09 as floats)", () => {
    expect(Math.abs(3.4 - 3.5) <= 0.1).toBe(false); // naive float comparison would reject the bound
    const data = within(3.5, 0.1);
    expect(value(numberScore(3.4, data))).toBe(1);
    expect(value(numberScore(3.6, data))).toBe(1);
    expect(value(numberScore(3.399, data))).toBe(0);
    expect(value(numberScore(3.601, data))).toBe(0);
  });

  it("tolerance with the smallest unit (0.001)", () => {
    const data = within(1.5, 0.001);
    expect(value(numberScore(1.499, data))).toBe(1);
    expect(value(numberScore(1.501, data))).toBe(1);
    expect(value(numberScore(1.498, data))).toBe(0);
  });

  it("tolerance around a negative answer, bounds included", () => {
    const data = within(-10, 0.5);
    expect(value(numberScore(-10.5, data))).toBe(1);
    expect(value(numberScore(-9.5, data))).toBe(1);
    expect(value(numberScore(-10.501, data))).toBe(0);
    expect(value(numberScore(-9.499, data))).toBe(0);
    expect(value(numberScore(10, data))).toBe(0);
  });

  it("tolerance across zero", () => {
    const data = within(0, 1);
    expect(value(numberScore(-1, data))).toBe(1);
    expect(value(numberScore(1, data))).toBe(1);
    expect(value(numberScore(-1.001, data))).toBe(0);
  });

  it("closest: guesses on both sides of zero tie", () => {
    const best = closestDistance([-1, 1, 3], 0);
    expect(best).toBe(1000);
    expect(value(numberScore(-1, closest(0), best))).toBe(1);
    expect(value(numberScore(1, closest(0), best))).toBe(1);
    expect(value(numberScore(3, closest(0), best))).toBe(0);
  });

  it("closest: negative answer and decimal guesses", () => {
    const best = closestDistance([-273.1, -273.2, -273], -273.15);
    // −273.1 and −273.2 are both 0.05 away
    expect(best).toBe(50);
    expect(value(numberScore(-273.1, closest(-273.15), best))).toBe(1);
    expect(value(numberScore(-273.2, closest(-273.15), best))).toBe(1);
    expect(value(numberScore(-273, closest(-273.15), best))).toBe(0);
  });

  it("closest: a difference of one unit (0.001) decides", () => {
    const best = closestDistance([10.001, 9.998], 10);
    expect(value(numberScore(10.001, closest(10), best))).toBe(1);
    expect(value(numberScore(9.998, closest(10), best))).toBe(0);
  });

  it("works at the value limits (±10¹²) without losing precision", () => {
    const max = 1_000_000_000_000;
    expect(numberDistance(max, -max)).toBe(2 * max * 1000);
    expect(Number.isSafeInteger(numberDistance(max, -max))).toBe(true);
    expect(value(numberScore(max - 0.001, within(max, 0.001)))).toBe(1);
    expect(value(numberScore(max - 0.002, within(max, 0.001)))).toBe(0);
  });
});
