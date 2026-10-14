import { describe, expect, it } from "vitest";
import { joinLimitKey } from "./play.js";
import { FixedWindowLimiter } from "./rateLimit.js";

function clock(start = 0) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe("FixedWindowLimiter", () => {
  it("allows `limit` hits per window and resets after it", () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(3, 1000, c.now);
    expect([1, 2, 3, 4].map(() => limiter.hit("a"))).toEqual([true, true, true, false]);
    expect(limiter.isLimited("a")).toBe(true);
    c.advance(1000);
    expect(limiter.isLimited("a")).toBe(false);
    expect(limiter.hit("a")).toBe(true);
  });

  it("keys IP + PIN independently: one network fills one game, other games keep their budget", () => {
    const limiter = new FixedWindowLimiter(2, 60_000, clock().now);
    const ip = "203.0.113.7";
    expect(limiter.hit(joinLimitKey(ip, "111111"))).toBe(true);
    expect(limiter.hit(joinLimitKey(ip, "111111"))).toBe(true);
    expect(limiter.hit(joinLimitKey(ip, "111111"))).toBe(false);
    expect(limiter.hit(joinLimitKey(ip, "222222"))).toBe(true);
    expect(limiter.hit(joinLimitKey("203.0.113.8", "111111"))).toBe(true);
  });

  it("isLimited does not count a hit", () => {
    const limiter = new FixedWindowLimiter(1, 1000, clock().now);
    for (let i = 0; i < 5; i++) expect(limiter.isLimited("a")).toBe(false);
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.isLimited("a")).toBe(true);
  });

  it("drops expired keys", () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(5, 1000, c.now);
    for (let i = 0; i < 100; i++) limiter.hit(`k${i}`);
    c.advance(500);
    limiter.hit("late");
    expect(limiter.size).toBe(101);
    c.advance(500);
    limiter.hit("late");
    expect(limiter.size).toBe(1);
  });

  it("keeps at most maxKeys keys, dropping the oldest window", () => {
    const c = clock();
    const limiter = new FixedWindowLimiter(1, 60_000, c.now, 3);
    for (const k of ["a", "b", "c", "d"]) {
      limiter.hit(k);
      c.advance(1);
    }
    expect(limiter.size).toBe(3);
    // "a" was dropped (fresh window), "d" is still counted.
    expect(limiter.hit("a")).toBe(true);
    expect(limiter.hit("d")).toBe(false);
  });
});
