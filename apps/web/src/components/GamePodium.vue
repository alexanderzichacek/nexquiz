<script setup lang="ts">
import type { RankingEntry } from "@nexquiz/shared";
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";
import { formatScore } from "@/lib/format";
import { podiumOrder } from "@/lib/leaderboard";

/**
 * Podium: three columns in the order 2 – 1 – 3. `revealed` says how many
 * places are visible counted from the 3rd place (0–3), so the host can
 * reveal 3rd → 2nd → 1st; the player shows it fully revealed.
 */
const props = withDefaults(
  defineProps<{
    podium: readonly RankingEntry[];
    revealed?: number;
    size?: "host" | "player";
    /** Highlights the own column on the player's end screen. */
    highlightId?: string | null;
  }>(),
  { revealed: 3, size: "player", highlightId: null },
);

const columns = computed(() => podiumOrder(props.podium));

/** Rank 3 is revealed first, rank 1 last. */
function isRevealed(rank: number): boolean {
  return props.revealed >= 4 - Math.min(rank, 3);
}
</script>

<template>
  <ol class="podium" :class="`podium--${size}`">
    <li
      v-for="entry in columns"
      :key="entry.playerId"
      class="podium__col"
      :class="[
        `podium__col--${Math.min(entry.rank, 3)}`,
        { 'podium__col--hidden': !isRevealed(entry.rank), 'podium__col--own': entry.playerId === highlightId },
      ]"
      :aria-hidden="!isRevealed(entry.rank) || undefined"
    >
      <span class="podium__name">{{ entry.nickname }}</span>
      <span class="podium__score tabular">{{ formatScore(entry.score) }}</span>
      <span class="podium__block">
        <span class="podium__rank tabular">{{ entry.rank }}</span>
        <span class="visually-hidden">{{ format(sk.game.place, { rank: entry.rank }) }}</span>
      </span>
    </li>
  </ol>
</template>

<style scoped>
.podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: var(--s-3);
  margin: 0;
  padding: 0;
  list-style: none;
}

.podium__col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-1);
  flex: 1;
  min-width: 0;
  max-width: var(--podium-col-max);
  transition:
    opacity var(--t-slow) var(--ease),
    transform var(--t-slow) var(--ease);
}

.podium__col--hidden {
  opacity: 0;
  transform: translateY(calc(var(--s-6) * var(--motion)));
}

.podium__name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-bold);
}

.podium__score {
  color: var(--text-muted);
  font-weight: var(--fw-semibold);
}

.podium__block {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  width: 100%;
  padding-top: var(--s-3);
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--surface-2);
  border: var(--border-w) solid var(--border);
  border-bottom: 0;
}

.podium__col--1 .podium__block {
  background: var(--primary);
  color: var(--primary-contrast);
  border-color: var(--primary);
}

.podium__col--own .podium__name {
  color: var(--primary);
}

.podium__rank {
  font-weight: var(--fw-black);
}

/* host: projector sizes */
.podium--host {
  gap: var(--s-5);
  font-size: var(--fs-host-option);
}

.podium--host .podium__rank {
  font-size: var(--fs-host-timer);
}

.podium--host .podium__col--1 .podium__block {
  height: var(--podium-h);
}

.podium--host .podium__col--2 .podium__block {
  height: calc(var(--podium-h) * 0.75);
}

.podium--host .podium__col--3 .podium__block {
  height: calc(var(--podium-h) * 0.55);
}

/* player: phone sizes */
.podium--player {
  font-size: var(--fs-body);
}

.podium--player .podium__rank {
  font-size: var(--fs-player-question);
}

.podium--player .podium__col--1 .podium__block {
  height: var(--podium-h-player);
}

.podium--player .podium__col--2 .podium__block {
  height: calc(var(--podium-h-player) * 0.75);
}

.podium--player .podium__col--3 .podium__block {
  height: calc(var(--podium-h-player) * 0.55);
}
</style>
