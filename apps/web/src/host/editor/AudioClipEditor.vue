<script setup lang="ts">
import { LIMITS, type Clip, type MediaUploadResponse } from "@nexquiz/shared";
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { format, sk } from "@/i18n/sk";
import { inputNumber, mediaUrl } from "@/lib/forms";
import { formatClock, parseClock } from "@/lib/time";
import FieldError from "./FieldError.vue";
import MediaUpload from "./MediaUpload.vue";
import type { ErrorMap } from "./validation";

/**
 * Audio upload + mini player and the clip (from / length) played on the host
 * screen. Shared by `music` (audio required) and `text` (audio optional, e.g.
 * a song cut off before the lyrics to fill in). Mount it with `:key` set to
 * the question id so the player state resets when another question is selected.
 */
const props = withDefaults(
  defineProps<{ audioId: string | undefined; clip: Clip | undefined; errors: ErrorMap; removable?: boolean }>(),
  { removable: false },
);
const emit = defineEmits<{ uploaded: [audioId: string]; remove: []; "update:clip": [clip: Clip] }>();

const audioEl = useTemplateRef<HTMLAudioElement>("audioEl");
/** File name of the last upload (not persisted; the server keeps only the id). */
const fileName = ref<string | null>(null);
const duration = ref<number | null>(null);
const playing = ref<"track" | "clip" | null>(null);
const clipText = ref(formatClock(props.clip?.start ?? 0));

const audioSrc = computed(() => (props.audioId ? mediaUrl(props.audioId) : undefined));

watch(
  () => props.audioId,
  () => {
    stop();
    duration.value = null;
  },
);

function onUploaded(media: MediaUploadResponse, name: string): void {
  fileName.value = name;
  if (media.duration !== undefined) duration.value = media.duration;
  emit("uploaded", media.id);
}

function onLoadedMetadata(): void {
  const d = audioEl.value?.duration;
  if (d !== undefined && Number.isFinite(d)) duration.value = d;
}

function onTimeUpdate(): void {
  const el = audioEl.value;
  if (!el || playing.value !== "clip" || !props.clip) return;
  if (el.currentTime >= props.clip.start + props.clip.duration) stop();
}

function stop(): void {
  audioEl.value?.pause();
  playing.value = null;
}

async function toggleTrack(): Promise<void> {
  const el = audioEl.value;
  if (!el) return;
  if (playing.value) {
    stop();
    return;
  }
  playing.value = "track";
  try {
    await el.play();
  } catch {
    playing.value = null;
  }
}

async function playClip(): Promise<void> {
  const el = audioEl.value;
  if (!el || !props.clip) return;
  if (playing.value === "clip") {
    stop();
    return;
  }
  el.currentTime = props.clip.start;
  playing.value = "clip";
  try {
    await el.play();
  } catch {
    playing.value = null;
  }
}

function onClipStart(event: Event): void {
  if (!props.clip) return;
  const value = (event.target as HTMLInputElement).value;
  clipText.value = value;
  emit("update:clip", { ...props.clip, start: parseClock(value) });
}

function onClipBlur(): void {
  const start = props.clip?.start;
  if (start !== undefined && Number.isFinite(start)) clipText.value = formatClock(start);
}

function onClipDuration(event: Event): void {
  if (!props.clip) return;
  emit("update:clip", { ...props.clip, duration: inputNumber(event) });
}

onBeforeUnmount(stop);
</script>

<template>
  <div class="stack">
    <div>
      <span class="label"><slot name="label">{{ sk.editor.audio }}</slot></span>
      <div class="player">
        <template v-if="audioSrc">
          <span class="player__name">
            {{ format(sk.editor.audioFile, { name: fileName ?? sk.editor.audioDefaultName }) }}
          </span>
          <button
            type="button"
            class="icon-btn"
            :aria-label="playing === 'track' ? sk.editor.pauseTrack : sk.editor.playTrack"
            @click="toggleTrack"
          >
            {{ playing === "track" ? "❚❚" : "▶" }}
          </button>
          <span v-if="duration !== null" class="player__time tabular">{{ formatClock(duration) }}</span>
          <audio
            ref="audioEl"
            :src="audioSrc"
            preload="metadata"
            @loadedmetadata="onLoadedMetadata"
            @timeupdate="onTimeUpdate"
            @ended="playing = null"
          ></audio>
        </template>
        <MediaUpload
          kind="audio"
          :has-media="!!audioSrc"
          :removable="removable"
          @uploaded="onUploaded"
          @remove="emit('remove')"
        />
      </div>
      <FieldError :message="errors['media.audioId']" />
    </div>

    <div v-if="clip">
      <span class="label">{{ sk.editor.clip }}</span>
      <div class="clip">
        <label class="clip__field">
          {{ sk.editor.clipFrom }}
          <input
            class="input input--narrow tabular"
            :class="{ 'input--error': errors['data.clip.start'] }"
            :value="clipText"
            inputmode="numeric"
            :title="sk.editor.clipFormatHint"
            @input="onClipStart"
            @blur="onClipBlur"
          />
        </label>
        <label class="clip__field">
          {{ sk.editor.clipLength }}
          <input
            type="number"
            class="input input--narrow tabular"
            :class="{ 'input--error': errors['data.clip.duration'] }"
            :value="clip.duration"
            :min="LIMITS.clip.minDuration"
            :max="LIMITS.clip.maxDuration"
            step="1"
            @input="onClipDuration"
          />
          {{ sk.editor.seconds }}
        </label>
        <BaseButton variant="secondary" :disabled="!audioSrc" @click="playClip">
          {{ playing === "clip" ? sk.editor.stopClip : sk.editor.playClip }}
        </BaseButton>
      </div>
      <slot name="clip-hint"></slot>
      <FieldError :message="errors['data.clip.start'] ?? errors['data.clip.duration']" />
    </div>
  </div>
</template>

<style scoped>
.player {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.player__name {
  font-weight: var(--fw-semibold);
  overflow-wrap: anywhere;
}

.player__time {
  color: var(--text-muted);
}

.clip {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.clip__field {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}
</style>
