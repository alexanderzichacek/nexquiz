<script setup lang="ts">
import type { AnswerPayload } from "@nexquiz/shared";
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { HAPTIC_WRONG, vibrate } from "@/lib/haptics";
import { resultKind } from "@/lib/format";
import ConnectionBadge from "./ConnectionBadge.vue";
import PlayFinished from "./PlayFinished.vue";
import PlayNickname from "./PlayNickname.vue";
import PlayQuestion from "./PlayQuestion.vue";
import PlayWaiting from "./PlayWaiting.vue";
import ResultBanner from "./ResultBanner.vue";
import { usePlayGame } from "./usePlayGame";

/**
 * Player UI `/play?pin=…` – mobile-first controller: PIN check, nickname,
 * waiting, questions, results, end. No AppFooter here.
 */
const route = useRoute();
const router = useRouter();

const pin = typeof route.query.pin === "string" ? route.query.pin.replace(/\s+/g, "") : "";
const game = usePlayGame(pin);
const { phase, view, connected, everConnected } = game;

onMounted(() => void game.start());

const result = computed(() => {
  const v = view.value;
  return v?.result && v.result.index === v.currentIndex ? v.result : null;
});

// Haptics: two pulses for a wrong answer (once per question).
let vibratedFor = -1;
watch(result, (r) => {
  if (!r || r.index === vibratedFor) return;
  vibratedFor = r.index;
  if (resultKind(r.correctness) === "wrong") vibrate(HAPTIC_WRONG);
});

function send(payload: AnswerPayload) {
  const index = view.value?.currentIndex ?? -1;
  return game.answer(index, payload);
}

function leave(): void {
  void router.push({ name: "landing" });
}

/** Badge only once the player is in the game (the first connect has its own „Pripájam…“ state). */
const showBadge = computed(() => everConnected.value && !connected.value && phase.value === "game");
</script>

<template>
  <!-- Player UI: mobile-first, no AppFooter. -->
  <div class="play">
    <ConnectionBadge :visible="showBadge" />
    <main class="play__card">
      <template v-if="phase === 'invalid'">
        <div class="play__center">
          <p class="play__error" role="alert">{{ sk.errors.pinNotFound }}</p>
        </div>
        <BaseButton variant="primary" block large @click="leave">{{ sk.play.back }}</BaseButton>
      </template>

      <template v-else-if="phase === 'kicked'">
        <div class="play__center">
          <p class="play__error" role="alert">{{ sk.errors.kicked }}</p>
        </div>
        <BaseButton variant="primary" block large @click="leave">{{ sk.play.back }}</BaseButton>
      </template>

      <div v-else-if="phase === 'checking'" class="play__center">
        <p class="play__muted" role="status">{{ sk.play.connecting }}</p>
      </div>

      <PlayNickname v-else-if="phase === 'nickname'" :pin="pin" :join="game.join" />

      <template v-else-if="view">
        <PlayWaiting v-if="view.state === 'LOBBY'" :nickname="view.nickname" :message="sk.play.waitingForStart" />

        <PlayQuestion
          v-else-if="view.state === 'QUESTION' && view.question"
          :key="`q${view.question.index}`"
          :question="view.question"
          :clock-offset="view.clockOffset"
          :has-answered="view.hasAnswered"
          :send="send"
        />

        <ResultBanner v-else-if="view.state === 'REVEAL' && result" :key="`r${result.index}`" :result="result" />

        <PlayWaiting
          v-else-if="view.state === 'REVEAL'"
          :nickname="view.nickname"
          :message="sk.play.waitingResult"
          :score="view.score"
          :rank="view.rank"
        />

        <PlayFinished
          v-else-if="view.state === 'FINISHED' && view.finished"
          :finished="view.finished"
          :player-id="view.playerId"
          @leave="leave"
        />

        <PlayWaiting
          v-else
          :nickname="view.nickname"
          :message="sk.play.waitingNext"
          :score="view.score"
          :rank="view.rank"
        />
      </template>
    </main>
  </div>
</template>

<style scoped>
.play {
  --play-bg: var(--bg);
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
  background: var(--play-bg);
  padding: var(--s-4);
  padding-top: max(var(--s-4), env(safe-area-inset-top));
  padding-bottom: max(var(--s-4), env(safe-area-inset-bottom));
  padding-left: max(var(--s-4), env(safe-area-inset-left));
  padding-right: max(var(--s-4), env(safe-area-inset-right));
}

.play__card {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  flex: 1;
  width: 100%;
  max-width: var(--w-player);
  margin: 0 auto;
}

@media (min-width: 600px) {
  .play__card {
    --play-bg: var(--surface);
    flex: 0 1 auto;
    min-height: var(--h-player-card);
    margin-top: var(--s-7);
    padding: var(--s-6);
    background: var(--play-bg);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow);
  }
}

.play__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  text-align: center;
}

.play__error {
  color: var(--danger);
  font-size: var(--fs-player-option);
  font-weight: var(--fw-semibold);
}

.play__muted {
  color: var(--text-muted);
}
</style>
