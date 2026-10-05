import { describe, expect, it } from "vitest";
import { plural, sk } from "@/i18n/sk";
import { formatAgo, formatClock, formatShortDate, parseClock } from "./time";

describe("formatAgo", () => {
  const now = Date.parse("2026-10-05T12:00:00Z");

  it("formats compact relative ages", () => {
    expect(formatAgo("2026-10-05T11:59:30Z", now)).toBe(sk.relative.now);
    expect(formatAgo("2026-10-05T11:55:00Z", now)).toBe("5 min");
    expect(formatAgo("2026-10-05T10:00:00Z", now)).toBe("2 h");
    expect(formatAgo("2026-10-02T12:00:00Z", now)).toBe("3 d");
  });
});

describe("formatShortDate", () => {
  it("prints day.month. in the current year and adds the year otherwise", () => {
    const now = new Date(2026, 9, 5);
    expect(formatShortDate(new Date(2026, 8, 28, 20).toISOString(), now)).toBe("28.9.");
    expect(formatShortDate(new Date(2025, 0, 2, 20).toISOString(), now)).toBe("2.1.2025");
  });
});

describe("clock", () => {
  it("formats and parses m:ss", () => {
    expect(formatClock(45)).toBe("0:45");
    expect(formatClock(222)).toBe("3:42");
    expect(parseClock("0:45")).toBe(45);
    expect(parseClock("3:42")).toBe(222);
    expect(parseClock("90")).toBe(90);
    expect(parseClock("1:75")).toBeNaN();
    expect(parseClock("abc")).toBeNaN();
  });
});

describe("plural", () => {
  it("uses Slovak plural forms", () => {
    expect(plural(1, sk.plural.questions)).toBe("1 otázka");
    expect(plural(3, sk.plural.questions)).toBe("3 otázky");
    expect(plural(15, sk.plural.questions)).toBe("15 otázok");
    expect(plural(0, sk.plural.players)).toBe("0 hráčov");
    expect(plural(12, sk.plural.players)).toBe("12 hráčov");
  });
});
