<script setup lang="ts">
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";
import { TIMER_DANGER_SECONDS } from "@/lib/serverClock";

/**
 * Circular countdown (SVG stroke) with the number in the middle. The last
 * 5 s turn `--danger` and pulse. Screen readers hear only the 10 s / 5 s
 * milestones (aria-live), not every second.
 */
const props = defineProps<{
  remainingMs: number;
  totalMs: number;
  seconds: number;
  milestone: number | null;
}>();

const RADIUS = 45;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const fraction = computed(() => (props.totalMs > 0 ? Math.min(1, Math.max(0, props.remainingMs / props.totalMs)) : 0));
const dashOffset = computed(() => CIRCUMFERENCE * (1 - fraction.value));
const danger = computed(() => props.seconds > 0 && props.seconds <= TIMER_DANGER_SECONDS);
</script>

<template>
  <div class="ring" :class="{ 'ring--danger': danger }">
    <svg class="ring__svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <circle class="ring__track" cx="50" cy="50" :r="RADIUS" />
      <circle
        class="ring__progress"
        cx="50"
        cy="50"
        :r="RADIUS"
        :stroke-dasharray="CIRCUMFERENCE"
        :stroke-dashoffset="dashOffset"
      />
    </svg>
    <span class="ring__value tabular" aria-hidden="true">{{ seconds }}</span>
    <span class="visually-hidden" aria-live="polite">
      {{ milestone === null ? "" : format(sk.game.timerLive, { seconds: milestone }) }}
    </span>
  </div>
</template>

<style scoped>
.ring {
  position: relative;
  display: inline-grid;
  place-items: center;
  width: var(--timer-ring);
  height: var(--timer-ring);
  flex: none;
}

.ring__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.ring__track,
.ring__progress {
  fill: none;
  stroke-width: var(--timer-stroke);
}

.ring__track {
  stroke: var(--surface-2);
}

.ring__progress {
  stroke: var(--primary);
  stroke-linecap: round;
  transition:
    stroke-dashoffset var(--t-fast) linear,
    stroke var(--t) var(--ease);
}

.ring__value {
  font-size: calc(var(--fs-host-timer) * 0.75);
  font-weight: var(--fw-black);
  line-height: 1;
}

.ring--danger .ring__progress {
  stroke: var(--danger);
}

.ring--danger .ring__value {
  color: var(--danger);
}

.ring--danger {
  animation: ring-pulse 1s var(--ease) infinite;
}

@keyframes ring-pulse {
  50% {
    transform: scale(calc(1 + 0.06 * var(--motion)));
  }
}
</style>
