<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { sk } from "@/i18n/sk";
import { fetchClip } from "./clip";
import { usePlayerMedia } from "./usePlayerMedia";

/**
 * Audio clip of a `music` / `text` question on the player's device (only
 * with sound on). The server sends just the cut clip without tags, so the
 * player hears exactly what the host screen plays. Starts by itself when
 * audio is unlocked; ▶ / ❚❚, replay and the clip progress in one row.
 */
const props = defineProps<{ index: number; duration: number }>();

const media = usePlayerMedia();
const status = ref<"loading" | "ready" | "failed">("loading");
const playing = ref(false);
const position = ref(0);
const length = ref(props.duration);

const progress = computed(() => (length.value > 0 ? Math.min(1, Math.max(0, position.value / length.value)) : 0));
const label = computed(() =>
  status.value === "loading" ? sk.play.clipLoading : status.value === "failed" ? sk.play.clipFailed : sk.play.listen,
);

const controller = new AbortController();
let buffer: AudioBuffer | null = null;
let stopSource: (() => void) | null = null;
/** Audio clock time at which position 0 of the running playback would have been. */
let startedAt = 0;
/** Increments with every start / stop, so an old `onEnded` is ignored. */
let run = 0;
let frame = 0;
let autoplayed = false;

function halt(): void {
  run += 1;
  stopSource?.();
  stopSource = null;
  playing.value = false;
  cancelAnimationFrame(frame);
}

function follow(): void {
  cancelAnimationFrame(frame);
  const step = (): void => {
    position.value = Math.min(length.value, media.audio.currentTime - startedAt);
    if (playing.value) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

function startAt(from: number): void {
  if (!buffer) return;
  halt();
  const current = run;
  const stop = media.audio.playBuffer(buffer, from, () => {
    if (current !== run) return;
    stopSource = null;
    playing.value = false;
    position.value = length.value;
    cancelAnimationFrame(frame);
  });
  if (!stop) return;
  stopSource = stop;
  startedAt = media.audio.currentTime - from;
  position.value = from;
  playing.value = true;
  follow();
}

async function toggle(): Promise<void> {
  if (playing.value) {
    const at = position.value;
    halt();
    position.value = at;
    return;
  }
  if (!(await media.audio.resume())) return;
  startAt(position.value >= length.value ? 0 : position.value);
}

async function replay(): Promise<void> {
  if (await media.audio.resume()) startAt(0);
}

function autoplay(): void {
  if (autoplayed || status.value !== "ready" || !media.unlocked.value) return;
  autoplayed = true;
  startAt(0);
}

onMounted(async () => {
  try {
    const data = await fetchClip(media.pin, props.index, controller.signal);
    buffer = data ? await media.audio.decode(data) : null;
  } catch {
    buffer = null;
  }
  if (controller.signal.aborted) return;
  if (!buffer) {
    status.value = "failed";
    return;
  }
  length.value = buffer.duration;
  status.value = "ready";
  autoplay();
});

// After a reload audio is locked until a tap; the clip then starts like on the host screen.
watch(media.unlocked, autoplay);

onBeforeUnmount(() => {
  controller.abort();
  halt();
});
</script>

<template>
  <div class="clip" :class="{ 'clip--playing': playing }">
    <button
      type="button"
      class="clip__button clip__button--main"
      :disabled="status !== 'ready'"
      :aria-label="playing ? sk.play.clipPause : sk.play.clipPlay"
      :aria-pressed="playing"
      @click="toggle"
    >
      <span aria-hidden="true">{{ playing ? "❚❚" : "▶" }}</span>
    </button>
    <button
      type="button"
      class="clip__button"
      :disabled="status !== 'ready'"
      :aria-label="sk.play.clipReplay"
      @click="replay"
    >
      <span aria-hidden="true">↺</span>
    </button>
    <div class="clip__body">
      <span class="clip__label" aria-live="polite">{{ label }}</span>
      <div
        class="clip__progress"
        role="progressbar"
        :aria-label="sk.play.clipProgress"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-valuenow="Math.round(progress * 100)"
      >
        <span class="clip__fill" :style="{ width: `${progress * 100}%` }"></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.clip {
  display: flex;
  align-items: center;
  gap: var(--s-3);
}

.clip__button {
  display: inline-grid;
  place-items: center;
  flex: none;
  width: var(--tap-min);
  height: var(--tap-min);
  border: 0;
  border-radius: 50%;
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-player-option);
  cursor: pointer;
}

.clip__button--main {
  background: var(--primary);
  color: var(--primary-contrast);
}

.clip__button:disabled {
  opacity: var(--opacity-disabled);
  cursor: default;
}

.clip__body {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  flex: 1;
  min-width: 0;
}

.clip__label {
  font-weight: var(--fw-bold);
}

.clip__progress {
  height: var(--progress-h);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.clip__fill {
  display: block;
  height: 100%;
  background: var(--primary);
}
</style>
