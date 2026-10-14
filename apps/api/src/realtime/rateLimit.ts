/** Upper bound of tracked keys; above it the oldest window is dropped (memory stays bounded). */
export const DEFAULT_MAX_KEYS = 50_000;

/**
 * Fixed-window rate limiter keyed by e.g. client IP + PIN (`player:join`).
 * Per process, like the default store of `@fastify/rate-limit`.
 *
 * All windows have the same length and an entry is re-inserted when its
 * window starts, so the Map's insertion order is also the expiry order:
 * expired entries are dropped from the front on every call (amortized O(1)),
 * and at most `maxKeys` entries are kept.
 */
export class FixedWindowLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys: number = DEFAULT_MAX_KEYS,
  ) {}

  /** Counts one hit; false when the key is over the limit in the current window. */
  hit(key: string): boolean {
    const t = this.now();
    this.evictExpired(t);
    const entry = this.hits.get(key);
    if (entry) {
      entry.count++;
      return entry.count <= this.limit;
    }
    if (this.hits.size >= this.maxKeys) this.evictOldest();
    this.hits.set(key, { count: 1, resetAt: t + this.windowMs });
    return true;
  }

  /** True when the key has used up its limit in the current window (does not count a hit). */
  isLimited(key: string): boolean {
    this.evictExpired(this.now());
    const entry = this.hits.get(key);
    return entry !== undefined && entry.count >= this.limit;
  }

  /** Number of tracked keys (for tests and diagnostics). */
  get size(): number {
    return this.hits.size;
  }

  private evictExpired(t: number): void {
    for (const [key, entry] of this.hits) {
      if (entry.resetAt > t) break;
      this.hits.delete(key);
    }
  }

  private evictOldest(): void {
    const oldest = this.hits.keys().next();
    if (!oldest.done) this.hits.delete(oldest.value);
  }
}
