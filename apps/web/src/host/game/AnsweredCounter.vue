<script setup lang="ts">
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";

/** `12 / 18` answered + mini progress bar (host). */
const props = defineProps<{ answered: number; total: number }>();

const percent = computed(() => (props.total > 0 ? Math.min(100, (props.answered / props.total) * 100) : 0));
</script>

<template>
  <!-- Not aria-live: screen readers hear only the timer milestones. -->
  <div class="answered">
    <span class="visually-hidden">{{ format(sk.game.answeredLabel, { answered, total }) }}</span>
    <span class="answered__value tabular" aria-hidden="true">
      {{ format(sk.game.answeredCount, { answered, total }) }} ✓
    </span>
    <span class="answered__bar" aria-hidden="true">
      <span class="answered__fill" :style="{ width: `${percent}%` }"></span>
    </span>
  </div>
</template>

<style scoped>
.answered {
  display: inline-flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--s-1);
  min-width: var(--answered-min);
}

.answered__value {
  font-size: var(--fs-host-body);
  font-weight: var(--fw-bold);
  text-align: right;
}

.answered__bar {
  height: var(--progress-h);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.answered__fill {
  display: block;
  height: 100%;
  background: var(--success);
  transition: width var(--t) var(--ease);
}
</style>
