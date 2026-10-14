import { describe, expect, it } from "vitest";
import { formatNumber, parseNumberInput } from "./number";

describe("parseNumberInput", () => {
  it.each([
    ["2026", 2026],
    ["  2026 ", 2026],
    ["1 998,5", 1998.5],
    ["1\u00A0000", 1000],
    ["12.5", 12.5],
    ["-3", -3],
    ["−3,25", -3.25],
    ["0,5", 0.5],
    [".5", 0.5],
    ["7.", 7],
    ["-0", 0],
  ])("parses %j as %j", (raw, expected) => {
    expect(parseNumberInput(raw)).toBe(expected);
  });

  it.each(["", " ", "abc", "12a", "1,2,3", "1.2.3", "--1", "1-", "+5", "1e3", "NaN", "Infinity", "0,0001"])(
    "rejects %j",
    (raw) => {
      expect(parseNumberInput(raw)).toBeNull();
    },
  );

  it("rejects values beyond the limit", () => {
    expect(parseNumberInput("1000000000000")).toBe(1_000_000_000_000);
    expect(parseNumberInput("1000000000001")).toBeNull();
  });
});

describe("formatNumber", () => {
  it("leaves four-digit numbers (years) ungrouped and groups from five digits", () => {
    expect(formatNumber(2026)).toBe("2026");
    expect(formatNumber(12450)).toBe("12\u00A0450");
    expect(formatNumber(1_250_000)).toBe("1\u00A0250\u00A0000");
  });

  it("uses a decimal comma, a real minus and no trailing zeros", () => {
    expect(formatNumber(12.5)).toBe("12,5");
    expect(formatNumber(-12.5)).toBe("−12,5");
    expect(formatNumber(100)).toBe("100");
    expect(formatNumber(0)).toBe("0");
    expect(formatNumber(0.001)).toBe("0,001");
  });
});
