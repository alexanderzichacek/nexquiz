<script setup lang="ts">
import type { Clip } from "@nexquiz/shared";
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef } from "vue";
import { sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";

/**
 * Host only: plays ONLY the clip (`start` … `start + duration`) of the
 * question's audio. Big ▶ / ❚❚ button, replay, clip progress and an
 * equalizer animation while playing. The file itself is never cut.
 */
const props = withDefaults(defineProps<{ audioId: string; clip: Clip; autoplay?: boolean }>(), { autoplay: true });
const emit = defineEmits<{ playing: [boolean] }>();

const audioEl = useTemplateRef<HTMLAudioElement>("audioEl");
const playing = ref(false);
const position = ref(0);
let frame = 0;

const clipEnd = computed(() => props.clip.start + props.clip.duration);
const progress = computed(() => Math.min(1, Math.max(0, position.value / props.clip.duration)));

function setPlaying(value: boolean): void {
  if (playing.value === value) return;
  playing.value = value;
  emit("playing", value);
}

function watchPosition(): void {
  cancelAnimationFrame(frame);
  const el = audioEl.value;
  if (!el) return;
  const step = (): void => {
    position.value = Math.max(0, el.currentTime - props.clip.start);
    if (el.currentTime >= clipEnd.value) {
      el.pause();
      position.value = props.clip.duration;
      setPlaying(false);
      return;
    }
    if (!el.paused) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}

async function play(fromStart: boolean): Promise<void> {
  const el = audioEl.value;
  if (!el) return;
  if (fromStart || el.currentTime < props.clip.start || el.currentTime >= clipEnd.value) {
    el.currentTime = props.clip.start;
    position.value = 0;
  }
  try {
    await el.play();
    setPlaying(true);
    watchPosition();
  } catch {
    // Autoplay blocked (no user gesture yet) – the host presses ▶.
    setPlaying(false);
  }
}

function pause(): void {
  audioEl.value?.pause();
  setPlaying(false);
  cancelAnimationFrame(frame);
}

function toggle(): void {
  if (playing.value) pause();
  else void play(false);
}

function onPause(): void {
  setPlaying(false);
}

onMounted(() => {
  if (props.autoplay) void play(true);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  audioEl.value?.pause();
  emit("playing", false);
});

defineExpose({ pause });
</script>

<template>
  <div class="audio" :class="{ 'audio--playing': playing }">
    <audio ref="audioEl" :src="mediaUrl(audioId)" preload="auto" @pause="onPause" @ended="onPause"></audio>
    <div class="audio__eq" aria-hidden="true">
      <span v-for="n in 5" :key="n" class="audio__eq-bar" :style="{ '--i': n }"></span>
    </div>
    <div class="audio__controls">
      <button
        type="button"
        class="audio__main"
        :aria-label="playing ? sk.game.audioPause : sk.game.audioPlay"
        :aria-pressed="playing"
        @click="toggle"
      >
        <span aria-hidden="true">{{ playing ? "❚❚" : "▶" }}</span>
      </button>
      <button type="button" class="audio__replay" :aria-label="sk.game.audioReplay" @click="play(true)">
        <span aria-hidden="true">↺</span>
      </button>
    </div>
    <div
      class="audio__progress"
      role="progressbar"
      :aria-label="sk.game.audioProgress"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress * 100)"
    >
      <span class="audio__fill" :style="{ width: `${progress * 100}%` }"></span>
    </div>
  </div>
</template>

<style scoped>
.audio {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-4);
  width: min(100%, var(--audio-w));
}

.audio__eq {
  display: flex;
  align-items: flex-end;
  gap: var(--s-2);
  height: var(--eq-h);
}

.audio__eq-bar {
  width: var(--eq-bar);
  height: 30%;
  border-radius: var(--radius-sm);
  background: var(--primary);
  transform-origin: bottom;
}

.audio--playing .audio__eq-bar {
  animation: eq calc(var(--t-slow) + var(--i) * var(--t-stagger) * 2) var(--ease) infinite alternate;
}

@keyframes eq {
  from {
    height: 25%;
  }
  to {
    height: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .audio--playing .audio__eq-bar {
    animation: none;
    height: 70%;
  }
}

.audio__controls {
  display: flex;
  align-items: center;
  gap: var(--s-4);
}

.audio__main,
.audio__replay {
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
}

.audio__main {
  width: var(--audio-btn);
  height: var(--audio-btn);
  background: var(--primary);
  color: var(--primary-contrast);
  font-size: var(--fs-host-timer);
  box-shadow: var(--shadow-lg);
}

.audio__replay {
  width: calc(var(--audio-btn) * 0.6);
  height: calc(var(--audio-btn) * 0.6);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-host-option);
}

.audio__progress {
  width: 100%;
  height: var(--progress-h);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.audio__fill {
  display: block;
  height: 100%;
  background: var(--primary);
}
</style>
