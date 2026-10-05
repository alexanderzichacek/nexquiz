<script setup lang="ts">
import type { GameFinishedEvent } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import GamePodium from "@/components/GamePodium.vue";
import { format, sk } from "@/i18n/sk";
import { formatScore } from "@/lib/format";

/** End screen: „Koniec hry! Skončil si {rank}. z {total}.“, own score and the podium. */
const props = defineProps<{ finished: GameFinishedEvent; playerId: string }>();
defineEmits<{ leave: [] }>();

const own = computed(() => props.finished.ranking.find((r) => r.playerId === props.playerId) ?? null);
</script>

<template>
  <section class="finished">
    <h1 class="finished__title">
      {{ own ? format(sk.play.finished, { rank: own.rank, total: finished.ranking.length }) : sk.play.gameOver }}
    </h1>
    <p v-if="own" class="finished__score tabular">{{ format(sk.play.score, { score: formatScore(own.score) }) }}</p>
    <div v-if="finished.podium.length > 0" class="finished__podium">
      <h2 class="visually-hidden">{{ sk.play.podium }}</h2>
      <GamePodium :podium="finished.podium" size="player" :highlight-id="playerId" />
    </div>
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
</style>
