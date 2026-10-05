/** Per-game timer registry (question deadlines). */
export interface Scheduler {
  /** Replaces any timer already scheduled under `key`. */
  schedule(key: string, delayMs: number, fn: () => void): void;
  cancel(key: string): void;
  cancelAll(): void;
}

/**
 * In-memory timers. They are not the source of truth: the deadline lives in
 * Redis and timers are restored from it after a restart.
 */
export class TimerScheduler implements Scheduler {
  private readonly timers = new Map<string, NodeJS.Timeout>();

  schedule(key: string, delayMs: number, fn: () => void): void {
    this.cancel(key);
    const timer = setTimeout(
      () => {
        this.timers.delete(key);
        fn();
      },
      Math.max(0, delayMs),
    );
    this.timers.set(key, timer);
  }

  cancel(key: string): void {
    const timer = this.timers.get(key);
    if (timer) clearTimeout(timer);
    this.timers.delete(key);
  }

  cancelAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }
}
