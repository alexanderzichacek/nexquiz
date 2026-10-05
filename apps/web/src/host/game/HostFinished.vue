<script setup lang="ts">
import type { GameFinishedEvent } from "@nexquiz/shared";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { RouterLink } from "vue-router";
import GamePodium from "@/components/GamePodium.vue";
import { sk } from "@/i18n/sk";
import { formatScore } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion";
import ConfettiCanvas from "./ConfettiCanvas.vue";

/**
 * End of the game: podium revealed 3rd → 2nd → 1st with a short pause,
 * confetti + fanfare for the winner, the full ranking and the CSV export.
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

const csvUrl = computed(() => `/api/games/${encodeURIComponent(props.gameId)}/results?format=csv`);
</script>

<template>
  <section class="finished">
    <h1 class="finished__title">{{ sk.game.podiumTitle }}</h1>

    <GamePodium v-if="places > 0" :podium="finished.podium" :revealed="revealed" size="host" />
    <p v-else class="finished__empty">{{ sk.game.noPlayersRanking }}</p>

    <section v-if="finished.ranking.length > 0" class="finished__ranking">
      <h2 class="finished__subtitle">{{ sk.game.fullRanking }}</h2>
      <ol class="finished__list">
        <li v-for="r in finished.ranking" :key="r.playerId" class="finished__row">
          <span class="finished__rank tabular">{{ r.rank }}.</span>
          <span class="finished__name">{{ r.nickname }}</span>
          <span class="finished__score tabular">{{ formatScore(r.score) }}</span>
        </li>
      </ol>
    </section>

    <footer class="finished__actions">
      <a class="finished__link finished__link--primary" :href="csvUrl" download>{{ sk.game.exportCsv }}</a>
      <RouterLink class="finished__link" :to="{ name: 'host-results', params: { id: gameId } }">
        {{ sk.game.resultsDetail }}
      </RouterLink>
      <RouterLink class="finished__link" :to="{ name: 'host-quizzes' }">{{ sk.game.backToQuizzes }}</RouterLink>
    </footer>

    <ConfettiCanvas v-if="confetti" />
  </section>
</template>

<style scoped>
.finished {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  flex: 1;
  min-height: 0;
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

.finished__ranking {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  width: min(100%, var(--stage-board-w));
  margin: 0 auto;
  min-height: 0;
}

.finished__subtitle {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.finished__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
  list-style: none;
  max-height: var(--stage-ranking-h);
  overflow-y: auto;
}

.finished__row {
  display: flex;
  gap: var(--s-4);
  padding: var(--s-2) var(--s-4);
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.finished__rank {
  min-width: var(--rank-col);
  font-weight: var(--fw-black);
  color: var(--text-muted);
}

.finished__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.finished__score {
  font-weight: var(--fw-bold);
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
