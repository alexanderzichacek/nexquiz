<script setup lang="ts">
import type { LeaderboardEntry } from "@nexquiz/shared";
import { computed, toRef } from "vue";
import { format, sk } from "@/i18n/sk";
import { formatDelta, formatScore } from "@/lib/format";
import { useCountUp } from "@/lib/useCountUp";

/** Rank, nickname, score (count-up), delta of the last question and the rank change ▲ / ▼. */
const props = defineProps<{ entry: LeaderboardEntry }>();

const score = useCountUp(toRef(() => props.entry.score), props.entry.score - props.entry.delta);

const change = computed(() => {
  const n = props.entry.rankChange;
  if (n > 0) return { kind: "up", text: format(sk.game.rankUp, { n }), label: format(sk.game.rankUpLabel, { n }) };
  if (n < 0) {
    const abs = Math.abs(n);
    return { kind: "down", text: format(sk.game.rankDown, { n: abs }), label: format(sk.game.rankDownLabel, { n: abs }) };
  }
  return { kind: "same", text: sk.game.rankSame, label: sk.game.rankSameLabel };
});
</script>

<template>
  <div class="row">
    <span class="row__rank tabular">{{ entry.rank }}</span>
    <span class="row__name">{{ entry.nickname }}</span>
    <span class="row__score tabular">{{ formatScore(score) }}</span>
    <span class="row__delta tabular">
      {{ formatDelta(entry.delta) }}
      <span class="visually-hidden">{{ sk.game.deltaLabel }}</span>
    </span>
    <span class="row__change tabular" :class="`row__change--${change.kind}`">
      <span aria-hidden="true">{{ change.text }}</span>
      <span class="visually-hidden">{{ change.label }}</span>
    </span>
  </div>
</template>

<style scoped>
.row {
  display: grid;
  grid-template-columns: var(--lb-columns);
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-5);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--fs-host-option);
}

.row__rank {
  font-weight: var(--fw-black);
  color: var(--text-muted);
}

.row__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-bold);
}

.row__score {
  font-weight: var(--fw-black);
  text-align: right;
}

.row__delta {
  color: var(--text-muted);
  text-align: right;
}

.row__change {
  font-weight: var(--fw-bold);
  text-align: right;
}

.row__change--up {
  color: var(--success);
}

.row__change--down {
  color: var(--danger);
}

.row__change--same {
  color: var(--text-muted);
}
</style>
