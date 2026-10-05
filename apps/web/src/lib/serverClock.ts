/**
 * Server time synchronization (LOGIC.md "Synchronizácia času"): the server
 * sends `serverNow` and `deadline` (epoch ms), the client only displays a
 * countdown computed with `offset = serverNow − Date.now()`.
 */

/** Offset to add to the local clock to get the server clock. */
export function clockOffset(serverNow: number, localNow: number = Date.now()): number {
  return serverNow - localNow;
}

/** Milliseconds left until `deadline` (server time), never negative. */
export function remainingMs(deadline: number, offset: number, localNow: number = Date.now()): number {
  return Math.max(0, deadline - (localNow + offset));
}

/** Whole seconds shown in the countdown (rounded up, so `0` means time is up). */
export function remainingSeconds(ms: number): number {
  return Math.max(0, Math.ceil(ms / 1000));
}

/** Countdown values announced to screen readers (DESIGN.md "Prístupnosť"). */
export const TIMER_MILESTONES = [10, 5] as const;

/** Seconds shown in the last part of the countdown in `--danger` (and with the tick sound). */
export const TIMER_DANGER_SECONDS = 5;

/**
 * The milestone the countdown is currently in (`10`, `5`) or `null`. The
 * aria-live text derived from it changes only when a milestone is crossed,
 * not every second.
 */
export function activeMilestone(seconds: number): number | null {
  let active: number | null = null;
  for (const m of TIMER_MILESTONES) {
    if (seconds > 0 && seconds <= m) active = m;
  }
  return active;
}
