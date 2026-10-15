<script setup lang="ts">
import type { AnswerPayload } from "@nexquiz/shared";
import { computed, onMounted, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { HAPTIC_WRONG, vibrate } from "@/lib/haptics";
import { resultKind } from "@/lib/format";
import { useKeyboardInset } from "@/lib/useKeyboardInset";
import ConnectionBadge from "./ConnectionBadge.vue";
import MediaToggle from "./MediaToggle.vue";
import PlayExplanation from "./PlayExplanation.vue";
import PlayFinished from "./PlayFinished.vue";
import PlayNickname from "./PlayNickname.vue";
import PlayPageContent from "./PlayPageContent.vue";
import PlayQuestion from "./PlayQuestion.vue";
import PlayWaiting from "./PlayWaiting.vue";
import ResultBanner from "./ResultBanner.vue";
import { usePlayGame } from "./usePlayGame";
import { providePlayerMedia } from "./usePlayerMedia";

/**
 * Player UI `/play?pin=…` – mobile-first controller: PIN check, nickname,
 * waiting, questions, results, end. No AppFooter here.
 */
const route = useRoute();
const router = useRouter();

const pin = typeof route.query.pin === "string" ? route.query.pin.replace(/\s+/g, "") : "";
const game = usePlayGame(pin);
const { phase, view, connected, everConnected, checkError } = game;
const media = providePlayerMedia(pin);

onMounted(() => void game.start());

const result = computed(() => {
  const v = view.value;
  return v?.result && v.result.index === v.currentIndex ? v.result : null;
});

/** Image of the revealed question (the hotspot result draws on it). */
const resultImageId = computed(() => {
  const q = view.value?.question;
  return q && q.index === result.value?.index ? (q.media?.imageId ?? null) : null;
});

// Haptics: two pulses for a wrong answer (once per question).
let vibratedFor = -1;
watch(result, (r) => {
  if (!r || r.index === vibratedFor) return;
  vibratedFor = r.index;
  if (resultKind(r.correctness) === "wrong") vibrate(HAPTIC_WRONG);
});

// Sound on this device (opt-in): gong at the end of a question, fanfare at the end of the game.
watch(
  () => view.value?.state,
  (state, prev) => {
    if (!media.enabled.value || prev === undefined) return;
    if (prev === "QUESTION" && state === "REVEAL") media.audio.gong();
    if (prev !== "FINISHED" && state === "FINISHED") media.audio.fanfare();
  },
);

/** The waiting screens have room for the sound switch (the player can change it between questions). */
const waiting = computed(() => {
  const state = view.value?.state;
  return state === "LOBBY" || state === "LEADERBOARD" || (state === "REVEAL" && result.value === null);
});

function send(payload: AnswerPayload) {
  const index = view.value?.currentIndex ?? -1;
  return game.answer(index, payload);
}

/** Repeats the PIN check after a rate limit / connection error. */
function retry(): void {
  void game.start();
}

function leave(): void {
  void router.push({ name: "landing" });
}

/**
 * During the game (not the nickname step and the final ranking) the screen is
 * exactly the visible viewport and never scrolls; an open on-screen keyboard
 * shrinks it, so „Odoslať“ at the bottom stays above the keyboard.
 */
const fit = computed(() => phase.value === "game" && view.value !== null && view.value.state !== "FINISHED");
const keyboardInset = useKeyboardInset();

/** Badge only once the player is in the game (the first connect has its own „Pripájam…“ state). */
const showBadge = computed(() => everConnected.value && !connected.value && phase.value === "game");
</script>

<template>
  <!-- Player UI: mobile-first, no AppFooter. -->
  <div class="play" :class="{ 'play--fit': fit }" :style="{ '--kb-inset': `${keyboardInset}px` }">
    <ConnectionBadge :visible="showBadge" />
    <main class="play__card">
      <template v-if="phase === 'invalid'">
        <div class="play__center">
          <p class="play__error" role="alert">{{ sk.errors.pinNotFound }}</p>
        </div>
        <BaseButton variant="primary" block large @click="leave">{{ sk.play.back }}</BaseButton>
      </template>

      <template v-else-if="phase === 'checkFailed'">
        <div class="play__center">
          <p class="play__error" role="alert">{{ checkError }}</p>
        </div>
        <BaseButton variant="primary" block large @click="retry">{{ sk.common.retry }}</BaseButton>
        <BaseButton variant="secondary" block large @click="leave">{{ sk.play.back }}</BaseButton>
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
        <PlayWaiting
          v-if="view.state === 'LOBBY'"
          :nickname="view.nickname"
          :avatar="view.avatar"
          :message="sk.play.waitingForStart"
        />

        <PlayQuestion
          v-else-if="view.state === 'QUESTION' && view.question"
          :key="`q${view.question.index}`"
          :question="view.question"
          :clock-offset="view.clockOffset"
          :has-answered="view.hasAnswered"
          :send="send"
        />

        <PlayPageContent
          v-else-if="view.state === 'PAGE' && view.page"
          :key="`p${view.page.index}`"
          :page="view.page"
        />

        <PlayExplanation
          v-else-if="view.state === 'EXPLANATION' && view.explanation"
          :key="`e${view.explanation.index}`"
          :explanation="view.explanation"
        />

        <ResultBanner
          v-else-if="view.state === 'REVEAL' && result"
          :key="`r${result.index}`"
          :result="result"
          :image-id="resultImageId"
        />

        <PlayWaiting
          v-else-if="view.state === 'REVEAL'"
          :nickname="view.nickname"
          :avatar="view.avatar"
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
          :avatar="view.avatar"
          :message="sk.play.waitingNext"
          :score="view.score"
          :rank="view.rank"
        />

        <MediaToggle v-if="waiting" class="play__media" />
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

/* the game screen: one viewport, no scrolling (the answer areas share the height) */
.play--fit {
  height: calc(100dvh - var(--kb-inset));
  min-height: 0;
  overflow: hidden;
}

.play--fit .play__card {
  min-height: 0;
}

/* a landscape phone (short, wide) uses the whole width during the game */
@media (orientation: landscape) and (max-height: 599px) {
  .play--fit .play__card {
    max-width: none;
  }
}

/* a card on large screens; a landscape phone (short) stays full-bleed */
@media (min-width: 600px) and (min-height: 600px) {
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

  .play--fit .play__card {
    flex: none;
    height: min(calc(100dvh - var(--kb-inset) - 2 * var(--s-7)), var(--h-player-card-max));
    min-height: 0;
    margin-block: auto;
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

.play__media {
  flex: none;
  align-self: center;
}
</style>
