<script setup lang="ts">
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";
import { TIMER_DANGER_SECONDS } from "@/lib/serverClock";

/** Thin countdown bar under the player's header; aria-live only at the 10 s / 5 s milestones. */
const props = defineProps<{ remainingMs: number; totalMs: number; seconds: number; milestone: number | null }>();

const fraction = computed(() => (props.totalMs > 0 ? Math.min(1, Math.max(0, props.remainingMs / props.totalMs)) : 0));
const danger = computed(() => props.seconds > 0 && props.seconds <= TIMER_DANGER_SECONDS);
</script>

<template>
  <span class="timer-bar" :class="{ 'timer-bar--danger': danger }" aria-hidden="true">
    <span class="timer-bar__fill" :style="{ transform: `scaleX(${fraction})` }"></span>
  </span>
  <span class="visually-hidden" aria-live="polite">
    {{ milestone === null ? "" : format(sk.play.timerLive, { seconds: milestone }) }}
  </span>
</template>

<style scoped>
.timer-bar {
  flex: 1;
  height: var(--timer-bar-h);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.timer-bar__fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--primary);
  transform-origin: left;
  transition:
    transform var(--t-fast) linear,
    background-color var(--t) var(--ease);
}

.timer-bar--danger .timer-bar__fill {
  background: var(--danger);
}
</style>
