<script setup lang="ts">
import type { GameFinishedEvent } from "@nexquiz/shared";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import GamePodium from "@/components/GamePodium.vue";
import RankingTable from "@/components/RankingTable.vue";
import { sk } from "@/i18n/sk";
import { rankingRest } from "@/lib/leaderboard";
import { prefersReducedMotion } from "@/lib/motion";
import ConfettiCanvas from "./ConfettiCanvas.vue";

/**
 * End of the game: podium revealed 3rd → 2nd → 1st with a short pause,
 * confetti + fanfare for the winner and the CSV export on the left, the rest
 * of the ranking (4th place onward) on the right, all within one screen.
 */
const props = defineProps<{ finished: GameFinishedEvent; gameId: string }>();
const emit = defineEmits<{ winner: [] }>();

/** Pause between podium places (token `--t-podium-step`). */
const STEP_MS = 900;
const START_DELAY_MS = 600;

const places = computed(() => props.finished.podium.length);
/** Number of revealed places counted from the 3rd (podium with < 3 players reveals fewer steps). */
const revealed = ref(0);
const confetti = ref(false);
const timers: number[] = [];

onMounted(() => {
  if (places.value === 0) return;
  if (prefersReducedMotion()) {
    revealed.value = 3;
    emit("winner");
    return;
  }
  // Steps start at the lowest occupied place (e.g. 2 players: 2nd → 1st).
  const first = 4 - places.value;
  revealed.value = first - 1;
  for (let step = first; step <= 3; step++) {
    timers.push(
      window.setTimeout(
        () => {
          revealed.value = step;
          if (step === 3) {
            confetti.value = true;
            emit("winner");
          }
        },
        START_DELAY_MS + (step - first) * STEP_MS,
      ),
    );
  }
});

onBeforeUnmount(() => timers.forEach((t) => window.clearTimeout(t)));

/** Players below the podium; with many of them the table flows into 2 columns. */
const rest = computed(() => rankingRest(props.finished.ranking, props.finished.podium));
/** Above this many rows a single column would need to scroll on a 1366 × 768 projector. */
const MULTI_COLUMN_FROM = 9;

const csvUrl = computed(() => `/api/games/${encodeURIComponent(props.gameId)}/results?format=csv`);
</script>

<template>
  <section class="finished" :class="{ 'finished--split': rest.length > 0 }">
    <div class="finished__main">
      <h1 class="finished__title">{{ sk.game.podiumTitle }}</h1>

      <GamePodium v-if="places > 0" :podium="finished.podium" :revealed="revealed" size="host" class="finished__podium" />
      <p v-else class="finished__empty">{{ sk.game.noPlayersRanking }}</p>

      <footer class="finished__actions">
        <a class="finished__link finished__link--primary" :href="csvUrl" download>{{ sk.game.exportCsv }}</a>
        <RouterLink class="finished__link" :to="{ name: 'host-results', params: { id: gameId } }">
          {{ sk.game.resultsDetail }}
        </RouterLink>
        <RouterLink class="finished__link" :to="{ name: 'host-quizzes' }">{{ sk.game.backToQuizzes }}</RouterLink>
      </footer>
    </div>

    <RankingTable
      v-if="rest.length > 0"
      :entries="rest"
      :title="sk.game.otherPlaces"
      size="host"
      :multi-column="rest.length >= MULTI_COLUMN_FROM"
      class="finished__rest"
    />

    <ConfettiCanvas v-if="confetti" />
  </section>
</template>

<style scoped>
.finished {
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
  flex: 1;
  min-height: 0;
}

.finished__main {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: var(--s-5);
  flex: 1;
  min-width: 0;
}

.finished__title {
  font-size: var(--fs-host-question);
  font-weight: var(--fw-bold);
  text-align: center;
}

.finished__empty {
  color: var(--text-muted);
  text-align: center;
}

/* wide host screen: podium on the left, the rest of the ranking on the right, no page scroll */
@media (min-width: 901px) {
  .finished--split {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
    grid-template-rows: minmax(0, 1fr);
  }

  .finished--split .finished__main {
    min-height: 0;
  }
}

/* narrow window: stacked, the stage scrolls */
@media (max-width: 900px) {
  .finished--split {
    flex: none;
  }
}

.finished__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-3);
}

.finished__link {
  display: inline-flex;
  align-items: center;
  min-height: var(--btn-h);
  padding: 0 var(--s-5);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}

.finished__link--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--primary-contrast);
}
</style>
