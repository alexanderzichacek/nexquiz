<script setup lang="ts">
import type { LeaderboardEvent } from "@nexquiz/shared";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { format, sk } from "@/i18n/sk";
import { byPreviousRank, byRank } from "@/lib/leaderboard";
import { prefersReducedMotion } from "@/lib/motion";
import LeaderboardRow from "./LeaderboardRow.vue";

/**
 * Top 10 after a question. Rows start in the previous order and then move
 * to their new positions (FLIP via `<TransitionGroup>` move transitions).
 */
const props = defineProps<{ leaderboard: LeaderboardEvent; advancing: boolean }>();
defineEmits<{ next: [] }>();

/** Pause before the rows move, so the previous order is visible first. */
const REORDER_DELAY_MS = 700;

const rows = ref(prefersReducedMotion() ? byRank(props.leaderboard.top) : byPreviousRank(props.leaderboard.top));
let timer: number | null = null;

onMounted(() => {
  timer = window.setTimeout(() => (rows.value = byRank(props.leaderboard.top)), REORDER_DELAY_MS);
});
onBeforeUnmount(() => {
  if (timer !== null) window.clearTimeout(timer);
});
// Re-sent after an override: just show the new order.
watch(
  () => props.leaderboard,
  (lb) => (rows.value = byRank(lb.top)),
);
</script>

<template>
  <section class="board">
    <h1 class="board__title">{{ format(sk.game.leaderboardTitle, { n: leaderboard.index + 1 }) }}</h1>
    <p v-if="rows.length === 0" class="board__empty">{{ sk.game.noPlayersRanking }}</p>
    <TransitionGroup v-else tag="ol" name="flip" class="board__list">
      <li v-for="entry in rows" :key="entry.playerId">
        <LeaderboardRow :entry="entry" />
      </li>
    </TransitionGroup>
    <footer class="board__footer">
      <BaseButton variant="primary" large class="board__next" :loading="advancing" @click="$emit('next')">
        {{ sk.game.next }}
      </BaseButton>
    </footer>
  </section>
</template>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  flex: 1;
  min-height: 0;
  width: min(100%, var(--stage-board-w));
  margin: 0 auto;
}

.board__title {
  font-size: var(--fs-host-question);
  font-weight: var(--fw-bold);
}

.board__empty {
  color: var(--text-muted);
}

.board__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
  flex: 1;
  min-height: 0;
}

.flip-move {
  transition: transform calc(var(--t-flip) * var(--motion)) var(--ease);
}

.board__footer {
  display: flex;
  justify-content: flex-end;
}

.board__next {
  font-size: var(--fs-host-option);
  padding: 0 var(--s-7);
}
</style>
