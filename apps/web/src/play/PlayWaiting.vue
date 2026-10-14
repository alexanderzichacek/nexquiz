<script setup lang="ts">
import type { Avatar } from "@nexquiz/shared";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import { format, sk } from "@/i18n/sk";
import { formatScore } from "@/lib/format";

/** „Si v hre!“ + avatar and nickname; between questions also the current score and rank. */
defineProps<{ nickname: string; avatar: Avatar; message: string; score?: number | null; rank?: number | null }>();
</script>

<template>
  <section class="waiting" role="status">
    <p class="waiting__in">{{ sk.play.inGame }}</p>
    <PlayerAvatar :avatar="avatar" class="waiting__avatar" />
    <p class="waiting__nick">{{ nickname }}</p>
    <p v-if="score !== undefined && score !== null" class="waiting__score tabular">
      {{
        rank ? format(sk.play.scoreRank, { score: formatScore(score), rank }) : format(sk.play.score, { score: formatScore(score) })
      }}
    </p>
    <p class="waiting__message">{{ message }}</p>
    <span class="waiting__dots" aria-hidden="true"><span></span><span></span><span></span></span>
  </section>
</template>

<style scoped>
.waiting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  flex: 1;
  min-height: 0;
  text-align: center;
}

/* short screens (landscape phone): tighter, still without scrolling */
@media (max-height: 480px) {
  .waiting {
    gap: var(--s-2);
  }
}

.waiting__in {
  font-size: var(--fs-player-question);
  font-weight: var(--fw-bold);
  color: var(--success);
}

.waiting__avatar {
  --avatar-size: var(--avatar-waiting);
}

.waiting__nick {
  font-size: var(--fs-player-pin);
  font-weight: var(--fw-black);
  overflow-wrap: anywhere;
}

.waiting__score {
  font-size: var(--fs-player-option);
  font-weight: var(--fw-bold);
}

.waiting__message {
  color: var(--text-muted);
}

.waiting__dots {
  display: inline-flex;
  gap: var(--s-2);
}

.waiting__dots span {
  width: var(--s-2);
  height: var(--s-2);
  border-radius: 50%;
  background: var(--primary);
  animation: dot calc(var(--t-slow) * 3) var(--ease) infinite;
}

.waiting__dots span:nth-child(2) {
  animation-delay: var(--t-slow);
}

.waiting__dots span:nth-child(3) {
  animation-delay: calc(var(--t-slow) * 2);
}

@keyframes dot {
  50% {
    opacity: 0.25;
  }
}

@media (prefers-reduced-motion: reduce) {
  .waiting__dots span {
    animation: none;
  }
}
</style>
