<script setup lang="ts">
import type { GameFinishedEvent } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import GamePodium from "@/components/GamePodium.vue";
import RankingTable from "@/components/RankingTable.vue";
import { format, sk } from "@/i18n/sk";
import { formatScore } from "@/lib/format";
import { rankingRest } from "@/lib/leaderboard";

/**
 * End screen: „Koniec hry! Skončil si {rank}. z {total}.“, own score, the
 * podium and below it the rest of the ranking (4th place onward) with the own
 * row highlighted. The rest scrolls inside its own area, so the own result,
 * the podium and „Späť na úvod“ stay in place even with many players.
 */
const props = defineProps<{ finished: GameFinishedEvent; playerId: string }>();
defineEmits<{ leave: [] }>();

const own = computed(() => props.finished.ranking.find((r) => r.playerId === props.playerId) ?? null);
const rest = computed(() => rankingRest(props.finished.ranking, props.finished.podium));
</script>

<template>
  <section class="finished" :class="{ 'finished--with-rest': rest.length > 0 }">
    <h1 class="finished__title">
      {{ own ? format(sk.play.finished, { rank: own.rank, total: finished.ranking.length }) : sk.play.gameOver }}
    </h1>
    <p v-if="own" class="finished__score tabular">{{ format(sk.play.score, { score: formatScore(own.score) }) }}</p>
    <div v-if="finished.podium.length > 0" class="finished__podium">
      <h2 class="visually-hidden">{{ sk.play.podium }}</h2>
      <GamePodium :podium="finished.podium" size="player" :highlight-id="playerId" />
    </div>
    <RankingTable
      v-if="rest.length > 0"
      :entries="rest"
      :title="sk.play.otherPlaces"
      size="player"
      :highlight-id="playerId"
      class="finished__rest"
    />
    <BaseButton variant="secondary" block large class="finished__leave" @click="$emit('leave')">
      {{ sk.play.toLanding }}
    </BaseButton>
  </section>
</template>

<style scoped>
.finished {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  flex: 1;
  justify-content: center;
  text-align: center;
}

/* with the ranking table the content starts at the top (title + own result first) */
.finished--with-rest {
  justify-content: flex-start;
  gap: var(--s-4);
}

.finished__title {
  font-size: var(--fs-player-question);
  font-weight: var(--fw-black);
}

.finished__score {
  font-size: var(--fs-player-option);
  font-weight: var(--fw-bold);
}

.finished__leave {
  margin-top: auto;
}

/* on short phones the page may scroll a bit here; „Späť na úvod“ stays reachable */
.finished--with-rest .finished__leave {
  position: sticky;
  bottom: max(var(--s-4), env(safe-area-inset-bottom));
  box-shadow: var(--shadow);
}
</style>
