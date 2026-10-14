<script setup lang="ts">
import type { FieldGroups, LobbyPlayer } from "@nexquiz/shared";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import AppWordmark from "@/components/AppWordmark.vue";
import BaseButton from "@/components/BaseButton.vue";
import { format, sk } from "@/i18n/sk";
import { TIMER_DANGER_SECONDS } from "@/lib/serverClock";
import { StageAudio } from "@/lib/sounds";
import { useCountdown } from "@/lib/useCountdown";
import { useFullscreen } from "@/lib/useFullscreen";
import { useAuthStore } from "@/stores/auth";
import { useConfirmStore } from "@/stores/confirm";
import { useToastStore } from "@/stores/toast";
import HostFinished from "./game/HostFinished.vue";
import HostLeaderboard from "./game/HostLeaderboard.vue";
import HostLobby from "./game/HostLobby.vue";
import HostPage from "./game/HostPage.vue";
import HostQuestion from "./game/HostQuestion.vue";
import HostReveal from "./game/HostReveal.vue";
import { useHostGame } from "./game/useHostGame";

/**
 * Host game screen `/host/games/:pin` – the „stage“ on a TV / projector.
 * `.stage` forces the dark theme; there is NO AppFooter during the game.
 */
const route = useRoute();
const router = useRouter();
const confirm = useConfirmStore();
const toast = useToastStore();
const auth = useAuthStore();

const pin = typeof route.params.pin === "string" ? route.params.pin : "";
const game = useHostGame(pin);
const view = game.view;

// ---- countdown (display only, synced via serverNow offset) ----
const deadline = computed(() => (view.value?.state === "QUESTION" ? (view.value.question?.deadline ?? null) : null));
const offset = computed(() => view.value?.clockOffset ?? 0);
const countdown = useCountdown(deadline, offset);

// ---- busy flags of host intents ----
const busy = ref<"start" | "next" | "endQuestion" | "end" | null>(null);
const pendingOverrides = ref<ReadonlySet<string>>(new Set());

async function run(kind: NonNullable<typeof busy.value>, action: () => Promise<boolean>): Promise<void> {
  if (busy.value) return;
  busy.value = kind;
  try {
    if (!(await action())) toast.show(sk.game.actionFailed, "error");
  } finally {
    busy.value = null;
  }
}

// ---- sounds (host only) ----
const audio = new StageAudio();
const lobbyMusic = ref(false);
// A music question or a text question with an audio clip (e.g. fill in the lyrics).
const isMusicQuestion = computed(
  () =>
    (view.value?.state === "QUESTION" || view.value?.state === "REVEAL") &&
    view.value.question?.media.audioId !== undefined,
);

function toggleLobbyMusic(): void {
  audio.unlock();
  lobbyMusic.value = !lobbyMusic.value;
}

// Background loop: optional, muted automatically during music questions and on the podium.
watch(
  [lobbyMusic, isMusicQuestion, () => view.value?.state],
  ([enabled, music, state]) => {
    if (enabled && !music && state !== "FINISHED") audio.startLoop();
    else audio.stopLoop();
  },
  { immediate: true },
);

// Tick in the last 5 s (not during music questions).
watch(countdown.seconds, (s, prev) => {
  if (view.value?.state !== "QUESTION" || isMusicQuestion.value) return;
  if (s !== prev && s > 0 && s <= TIMER_DANGER_SECONDS) audio.tick();
});

// Gong at the end of every question.
watch(
  () => view.value?.state,
  (state, prev) => {
    if (prev === "QUESTION" && state === "REVEAL") audio.gong();
  },
);

// ---- host intents ----
function start(): void {
  // „Spustiť“ also unlocks the audio context (autoplay policy).
  audio.unlock();
  void run("start", game.start);
}

async function kick(player: LobbyPlayer): Promise<void> {
  const ok = await confirm.ask({
    title: sk.game.kickTitle,
    message: format(sk.game.kickMessage, { nickname: player.nickname }),
    confirmLabel: sk.game.kickConfirm,
    cancelLabel: sk.common.cancel,
    danger: true,
  });
  if (ok && !(await game.kick(player.id))) toast.show(sk.game.actionFailed, "error");
}

async function endGame(): Promise<void> {
  const ok = await confirm.ask({
    title: sk.game.endGameTitle,
    message: sk.game.endGameMessage,
    confirmLabel: sk.game.endGame,
    cancelLabel: sk.common.cancel,
    danger: true,
  });
  if (ok) await run("end", game.end);
}

async function override(fieldKey: FieldGroups["key"], normalized: string, accept: boolean): Promise<void> {
  const v = view.value;
  if (!v) return;
  const key = `${fieldKey}:${normalized}`;
  pendingOverrides.value = new Set([...pendingOverrides.value, key]);
  try {
    const ok = await game.override({ questionIndex: v.currentIndex, fieldKey, normalized, accept });
    if (!ok) toast.show(sk.game.actionFailed, "error");
  } finally {
    const next = new Set(pendingOverrides.value);
    next.delete(key);
    pendingOverrides.value = next;
  }
}

// An expired host session goes back to the landing page.
watch(game.status, (status) => {
  if (status === "unauthorized") {
    auth.setAuthenticated(false);
    void router.replace({ name: "landing" });
  }
});

// Dialogs and toasts are rendered outside `.stage`: switch the whole document to the dark theme.
let previousTheme: string | undefined;
onMounted(() => {
  previousTheme = document.documentElement.dataset.theme;
  document.documentElement.dataset.theme = "dark";
});
onBeforeUnmount(() => {
  if (previousTheme === undefined) delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = previousTheme;
  audio.dispose();
});

// Fullscreen toggle (TV / projector); `F` toggles it too. Hidden where the API is missing (iPhone Safari).
const fullscreen = useFullscreen({ shortcut: true });
const fullscreenLabel = computed(() => (fullscreen.active.value ? sk.game.fullscreenExit : sk.game.fullscreenEnter));

const showWordmark = computed(() => view.value?.state === "LOBBY" || view.value?.state === "FINISHED");
const canEnd = computed(() => view.value !== null && view.value.state !== "FINISHED");
</script>

<template>
  <div class="stage host-game">
    <header class="host-game__top">
      <AppWordmark v-if="showWordmark" small class="host-game__wordmark" />
      <span v-else></span>
      <div class="host-game__tools">
        <span v-if="!game.connected.value && game.status.value === 'ready'" class="host-game__offline" role="status">
          {{ sk.game.connecting }}
        </span>
        <button
          v-if="view && view.state !== 'FINISHED'"
          type="button"
          class="host-game__tool"
          :aria-pressed="lobbyMusic"
          @click="toggleLobbyMusic"
        >
          {{ sk.game.lobbyMusic }}: {{ lobbyMusic ? sk.game.lobbyMusicOn : sk.game.lobbyMusicOff }}
        </button>
        <button v-if="canEnd" type="button" class="host-game__tool" :disabled="busy === 'end'" @click="endGame">
          {{ sk.game.endGame }}
        </button>
        <button
          v-if="fullscreen.supported"
          type="button"
          class="host-game__tool host-game__tool--icon"
          :aria-label="fullscreenLabel"
          :title="format(sk.game.fullscreenTitle, { label: fullscreenLabel })"
          aria-keyshortcuts="F"
          @click="fullscreen.toggle"
        >
          <svg class="host-game__icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path v-if="fullscreen.active.value" d="M9 3v6H3M15 3v6h6M9 21v-6H3M15 21v-6h6" />
            <path v-else d="M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6" />
          </svg>
        </button>
      </div>
    </header>

    <main class="host-game__main">
      <div v-if="game.status.value === 'notFound'" class="host-game__center">
        <p class="host-game__message" role="alert">{{ sk.game.notFound }}</p>
        <RouterLink class="host-game__back" :to="{ name: 'host-quizzes' }">{{ sk.game.backToQuizzes }}</RouterLink>
      </div>

      <div v-else-if="!view" class="host-game__center">
        <p class="host-game__message" role="status">
          {{ game.status.value === "error" ? sk.errors.generic : sk.game.connecting }}
        </p>
        <BaseButton v-if="game.status.value === 'error'" variant="secondary" @click="router.go(0)">
          {{ sk.common.retry }}
        </BaseButton>
      </div>

      <HostLobby
        v-else-if="view.state === 'LOBBY'"
        :pin="view.pin"
        :quiz-title="view.quizTitle"
        :players="view.players"
        :starting="busy === 'start'"
        @start="start"
        @kick="kick"
      />

      <HostQuestion
        v-else-if="view.state === 'QUESTION' && view.question"
        :key="`q${view.question.index}`"
        :question="view.question"
        :progress="view.progress"
        :remaining-ms="countdown.remaining.value"
        :seconds="countdown.seconds.value"
        :milestone="countdown.milestone.value"
        :ending="busy === 'endQuestion'"
        @end-question="run('endQuestion', game.endQuestion)"
      />

      <HostPage
        v-else-if="view.state === 'PAGE' && view.page"
        :key="`p${view.page.index}`"
        :page="view.page"
        :advancing="busy === 'next'"
        @next="run('next', game.next)"
      />

      <HostReveal
        v-else-if="view.state === 'REVEAL' && view.question"
        :key="`r${view.question.index}`"
        :question="view.question"
        :reveal="view.reveal"
        :pending-overrides="pendingOverrides"
        :advancing="busy === 'next'"
        @next="run('next', game.next)"
        @override="override"
      />

      <HostLeaderboard
        v-else-if="view.state === 'LEADERBOARD' && view.leaderboard"
        :key="`l${view.leaderboard.index}`"
        :leaderboard="view.leaderboard"
        :advancing="busy === 'next'"
        @next="run('next', game.next)"
      />

      <HostFinished
        v-else-if="view.state === 'FINISHED' && view.finished"
        :finished="view.finished"
        :game-id="view.gameId"
        @winner="audio.fanfare()"
      />

      <div v-else class="host-game__center">
        <p class="host-game__message" role="status">{{ sk.game.evaluating }}</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
/* The stage never scrolls: every screen shares 100dvh (DESIGN.md "Responzivita"). */
.host-game {
  display: flex;
  flex-direction: column;
  height: 100dvh;
  overflow: hidden;
  padding: var(--stage-pad-y) var(--stage-pad);
  gap: var(--stage-gap);
}

.host-game__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  min-height: var(--btn-h);
}

.host-game__wordmark {
  font-size: var(--fs-host-body);
}

.host-game__tools {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.host-game__tool {
  min-height: var(--btn-h);
  padding: 0 var(--s-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  font-size: var(--fs-host-label);
  cursor: pointer;
}

.host-game__tool--icon {
  display: inline-grid;
  place-items: center;
  min-width: var(--btn-h);
  padding: 0;
}

.host-game__icon {
  width: var(--icon);
  height: var(--icon);
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.host-game__tool:hover:not(:disabled),
.host-game__tool[aria-pressed="true"] {
  background: var(--surface-2);
  color: var(--text);
}

.host-game__offline {
  padding: var(--s-1) var(--s-3);
  border-radius: var(--radius-sm);
  background: var(--warning);
  color: var(--qr-text);
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
}

.host-game__main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  width: 100%;
  max-width: var(--stage-max);
  margin: 0 auto;
  overflow-y: auto;
}

.host-game__center {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  flex: 1;
}

.host-game__message {
  font-size: var(--fs-host-option);
  color: var(--text-muted);
  text-align: center;
}

.host-game__back {
  font-size: var(--fs-host-body);
}
</style>
