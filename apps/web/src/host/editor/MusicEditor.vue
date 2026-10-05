<script setup lang="ts">
import { LIMITS, type MediaUploadResponse, type MusicQuestion } from "@nexquiz/shared";
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { format, sk } from "@/i18n/sk";
import { inputNumber, mediaUrl } from "@/lib/forms";
import { formatClock, parseClock } from "@/lib/time";
import AliasChips from "./AliasChips.vue";
import AnswerTester from "./AnswerTester.vue";
import FieldError from "./FieldError.vue";
import MediaUpload from "./MediaUpload.vue";
import type { ErrorMap } from "./validation";

/** `music` question: audio upload + mini player, clip (from / length), two weighted alias fields. */
const question = defineModel<MusicQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();

const audioEl = useTemplateRef<HTMLAudioElement>("audioEl");
/** File name of the last upload (not persisted; the server keeps only the id). */
const fileName = ref<string | null>(null);
const duration = ref<number | null>(null);
const playing = ref<"track" | "clip" | null>(null);
const clipText = ref(formatClock(question.value.data.clip.start));

const audioId = computed(() => question.value.media?.audioId);
const audioSrc = computed(() => (audioId.value ? mediaUrl(audioId.value) : undefined));

watch(
  () => question.value.id,
  () => {
    stop();
    fileName.value = null;
    duration.value = null;
    clipText.value = formatClock(question.value.data.clip.start);
  },
);

watch(audioId, () => {
  stop();
  duration.value = null;
});

function onUploaded(media: MediaUploadResponse, name: string): void {
  question.value.media = { audioId: media.id };
  fileName.value = name;
  if (media.duration !== undefined) duration.value = media.duration;
}

function onLoadedMetadata(): void {
  const d = audioEl.value?.duration;
  if (d !== undefined && Number.isFinite(d)) duration.value = d;
}

function onTimeUpdate(): void {
  const el = audioEl.value;
  if (!el || playing.value !== "clip") return;
  const { start, duration: length } = question.value.data.clip;
  if (el.currentTime >= start + length) stop();
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
  if (!el) return;
  if (playing.value === "clip") {
    stop();
    return;
  }
  el.currentTime = question.value.data.clip.start;
  playing.value = "clip";
  try {
    await el.play();
  } catch {
    playing.value = null;
  }
}

function onClipStart(event: Event): void {
  const value = (event.target as HTMLInputElement).value;
  clipText.value = value;
  question.value.data.clip.start = parseClock(value);
}

function onClipBlur(): void {
  const start = question.value.data.clip.start;
  if (Number.isFinite(start)) clipText.value = formatClock(start);
}

function onClipDuration(event: Event): void {
  question.value.data.clip.duration = inputNumber(event);
}

function onWeight(index: 0 | 1, event: Event): void {
  question.value.data.fields[index].weight = inputNumber(event);
}

function fieldPoints(weight: number): string {
  const value = weight * question.value.points;
  return Number.isFinite(value) ? String(Math.round(value * 100) / 100) : "–";
}

const FIELD_INDEXES = [0, 1] as const;

onBeforeUnmount(stop);
</script>

<template>
  <div class="stack">
    <div>
      <span class="label">{{ sk.editor.audio }}</span>
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
        <MediaUpload kind="audio" :has-media="!!audioSrc" :removable="false" @uploaded="onUploaded" />
      </div>
      <FieldError :message="errors['media.audioId']" />
    </div>

    <div>
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
            :value="question.data.clip.duration"
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
      <FieldError :message="errors['data.clip.start'] ?? errors['data.clip.duration']" />
    </div>

    <div v-for="i in FIELD_INDEXES" :key="question.data.fields[i].key" class="field-block">
      <div class="field-block__head">
        <span class="label">{{ question.data.fields[i].label ?? sk.fields[question.data.fields[i].key] }}</span>
        <label class="weight">
          {{ sk.editor.fieldWeight }}
          <input
            type="number"
            class="input input--narrow tabular"
            :class="{ 'input--error': errors[`data.fields.${i}.weight`] || errors['data.fields'] }"
            :value="question.data.fields[i].weight"
            min="0"
            max="1"
            step="0.05"
            @input="onWeight(i, $event)"
          />
          <span class="hint tabular">{{ format(sk.editor.fieldPoints, { points: fieldPoints(question.data.fields[i].weight) }) }}</span>
        </label>
      </div>
      <AliasChips
        v-model="question.data.fields[i].accepted"
        :label="question.data.fields[i].label ?? sk.fields[question.data.fields[i].key]"
        :invalid="!!errors[`data.fields.${i}.accepted`]"
      />
      <FieldError :message="errors[`data.fields.${i}.accepted`] ?? errors[`data.fields.${i}.weight`]" />
      <AnswerTester :accepted="question.data.fields[i].accepted" :tolerance="question.data.tolerance" />
    </div>
    <FieldError :message="errors['data.fields']" />
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

.clip__field,
.weight {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

.field-block {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  padding-top: var(--s-3);
  border-top: var(--border-w) solid var(--border);
}

.field-block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-2);
}
</style>
