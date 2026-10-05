<script setup lang="ts">
import type { AnswerGroup } from "@nexquiz/shared";
import { onBeforeUnmount, ref, watch } from "vue";
import { format, sk } from "@/i18n/sk";

/**
 * Reveal of `text` / `music`: rows `answer × count` with a ✓ / ✗ toggle.
 * Accepted rows have a green left border, rows changed by the host the ✋
 * icon. A row flashes when its decision changes (after `question:reveal`).
 */
const props = defineProps<{
  label: string;
  groups: readonly AnswerGroup[];
  /** `normalized` keys with an override in flight. */
  pending: ReadonlySet<string>;
}>();
const emit = defineEmits<{ toggle: [normalized: string, accept: boolean] }>();

const FLASH_MS = 700;
const flashing = ref<ReadonlySet<string>>(new Set());
let flashTimer: number | null = null;

watch(
  () => props.groups,
  (next, prev) => {
    if (!prev) return;
    const before = new Map(prev.map((g) => [g.normalized, g.accepted]));
    const changed = next.filter((g) => before.has(g.normalized) && before.get(g.normalized) !== g.accepted);
    if (changed.length === 0) return;
    flashing.value = new Set(changed.map((g) => g.normalized));
    if (flashTimer !== null) window.clearTimeout(flashTimer);
    flashTimer = window.setTimeout(() => (flashing.value = new Set()), FLASH_MS);
  },
);

onBeforeUnmount(() => {
  if (flashTimer !== null) window.clearTimeout(flashTimer);
});

function display(group: AnswerGroup): string {
  return group.examples[0] ?? group.normalized;
}
</script>

<template>
  <section class="groups">
    <h3 class="groups__label">{{ label }}</h3>
    <p v-if="groups.length === 0" class="groups__empty">{{ sk.game.noAnswers }}</p>
    <ul v-else class="groups__list">
      <li
        v-for="g in groups"
        :key="g.normalized"
        class="groups__row"
        :class="{
          'groups__row--accepted': g.accepted,
          'groups__row--flash': flashing.has(g.normalized),
        }"
      >
        <span class="groups__answer" :title="g.examples.join(', ')">{{ display(g) }}</span>
        <span
          v-if="g.overridden"
          class="groups__hand"
          :title="sk.game.groupOverridden"
          :aria-label="sk.game.groupOverridden"
          role="img"
        >✋</span>
        <span class="groups__count tabular">{{ format(sk.game.groupCount, { count: g.count }) }}</span>
        <button
          type="button"
          class="groups__toggle"
          :class="g.accepted ? 'groups__toggle--on' : 'groups__toggle--off'"
          :aria-pressed="g.accepted"
          :aria-label="format(sk.game.groupToggle, { answer: display(g) })"
          :disabled="pending.has(g.normalized)"
          @click="emit('toggle', g.normalized, !g.accepted)"
        >
          {{ g.accepted ? sk.game.groupAccepted : sk.game.groupRejected }}
        </button>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.groups {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  min-width: 0;
  min-height: 0;
}

.groups__label {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.groups__empty {
  color: var(--text-muted);
}

.groups__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.groups__row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) var(--s-3);
  border-left: var(--ring-selected) solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.groups__row--accepted {
  border-left-color: var(--success);
}

.groups__row--flash {
  animation: flash var(--t-slow) var(--ease);
}

@keyframes flash {
  30% {
    background: var(--surface-2);
    box-shadow: 0 0 0 var(--focus-ring) var(--primary);
  }
}

.groups__answer {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-semibold);
}

.groups__hand {
  font-size: var(--hand-icon);
}

.groups__count {
  color: var(--text-muted);
}

.groups__toggle {
  min-height: var(--btn-h);
  min-width: var(--toggle-min);
  padding: 0 var(--s-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  font-size: var(--fs-host-label);
  font-weight: var(--fw-bold);
  cursor: pointer;
}

.groups__toggle--on {
  background: var(--success);
  border-color: var(--success);
  color: var(--primary-contrast);
}

.groups__toggle--off {
  background: var(--surface-2);
  color: var(--text);
}

.groups__toggle:disabled {
  opacity: var(--opacity-disabled);
  cursor: progress;
}
</style>
