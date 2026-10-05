import { computed, onBeforeUnmount, ref, type Ref } from "vue";
import { activeMilestone, remainingMs, remainingSeconds } from "./serverClock";

/** Refresh rate of the countdown display. */
const TICK_MS = 100;

/**
 * Reactive countdown to a server `deadline` (epoch ms) using the server clock
 * `offset`. Display only – the server decides when a question ends.
 */
export function useCountdown(deadline: Ref<number | null>, offset: Ref<number>) {
  const now = ref(Date.now());
  const timer = window.setInterval(() => {
    now.value = Date.now();
  }, TICK_MS);
  onBeforeUnmount(() => window.clearInterval(timer));

  const remaining = computed(() => (deadline.value === null ? 0 : remainingMs(deadline.value, offset.value, now.value)));
  const seconds = computed(() => remainingSeconds(remaining.value));
  const milestone = computed(() => activeMilestone(seconds.value));
  const expired = computed(() => deadline.value !== null && remaining.value <= 0);
  return { remaining, seconds, milestone, expired };
}
