<script setup lang="ts">
import { LIMITS, type Clip, type Explanation, type ExplanationMedia, type MediaUploadResponse } from "@nexquiz/shared";
import { computed } from "vue";
import { sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import AudioClipEditor from "./AudioClipEditor.vue";
import { DEFAULT_CLIP } from "./defaults";
import FieldError from "./FieldError.vue";
import MediaUpload from "./MediaUpload.vue";
import type { ErrorMap } from "./validation";

/**
 * Explanation screen of a question (shown after its reveal): text, an image
 * or a video, and an audio clip. Audio and video would play at once on the
 * host screen, so uploading one drops the other (like a `text` question).
 */
const explanation = defineModel<Explanation>({ required: true });
const props = defineProps<{ questionId: string; errors: ErrorMap }>();

const textId = computed(() => `explanation-text-${props.questionId}`);
const imageId = computed(() => explanation.value.media?.imageId);
const videoId = computed(() => explanation.value.media?.videoId);
/** `AudioClipEditor` reads the error keys of a question's own audio and clip. */
const audioErrors = computed<ErrorMap>(() => {
  const out: ErrorMap = {};
  const copy = (from: string, to: string): void => {
    const message = props.errors[from];
    if (message !== undefined) out[to] = message;
  };
  copy("explanation.media.audioId", "media.audioId");
  copy("explanation.clip.start", "data.clip.start");
  copy("explanation.clip.duration", "data.clip.duration");
  return out;
});

function setMedia(media: ExplanationMedia): void {
  explanation.value.media = media.imageId || media.videoId || media.audioId ? media : undefined;
}

function onImageUploaded(media: MediaUploadResponse): void {
  const next = { ...explanation.value.media, imageId: media.id };
  delete next.videoId;
  setMedia(next);
}

function onVideoUploaded(media: MediaUploadResponse): void {
  const next = { ...explanation.value.media, videoId: media.id };
  delete next.imageId;
  delete next.audioId;
  delete explanation.value.clip;
  setMedia(next);
}

function removeImage(): void {
  const next = { ...explanation.value.media };
  delete next.imageId;
  setMedia(next);
}

function removeVideo(): void {
  const next = { ...explanation.value.media };
  delete next.videoId;
  setMedia(next);
}

function onAudioUploaded(audioId: string): void {
  const next = { ...explanation.value.media, audioId };
  delete next.videoId;
  setMedia(next);
  explanation.value.clip ??= { ...DEFAULT_CLIP };
}

function removeAudio(): void {
  const next = { ...explanation.value.media };
  delete next.audioId;
  setMedia(next);
  delete explanation.value.clip;
}

function setClip(clip: Clip): void {
  explanation.value.clip = clip;
}
</script>

<template>
  <div class="ee">
    <div>
      <label class="label" :for="textId">{{ sk.editor.explanationText }}</label>
      <textarea
        :id="textId"
        v-model="explanation.text"
        class="input ee__text"
        :class="{ 'input--error': errors['explanation.text'] }"
        rows="4"
        :maxlength="LIMITS.explanationText.max"
        :placeholder="sk.editor.explanationTextPlaceholder"
      ></textarea>
      <FieldError :message="errors['explanation.text']" />
    </div>

    <div class="ee__media">
      <span class="label">{{ sk.editor.mediaOptional }}</span>
      <img v-if="imageId" :src="mediaUrl(imageId)" alt="" class="ee__image" />
      <video v-else-if="videoId" :src="mediaUrl(videoId)" class="ee__image" controls preload="metadata"></video>
      <div class="ee__media-actions">
        <MediaUpload kind="image" :has-media="!!imageId" @uploaded="onImageUploaded" @remove="removeImage" />
        <MediaUpload kind="video" :has-media="!!videoId" @uploaded="onVideoUploaded" @remove="removeVideo" />
      </div>
      <FieldError :message="errors['explanation.media.imageId']" />
      <FieldError :message="errors['explanation.media.videoId']" />
    </div>

    <div>
      <AudioClipEditor
        :key="`explanation-${questionId}`"
        :audio-id="explanation.media?.audioId"
        :clip="explanation.clip"
        :errors="audioErrors"
        removable
        @uploaded="onAudioUploaded"
        @remove="removeAudio"
        @update:clip="setClip"
      >
        <template #label>{{ sk.editor.explanationAudio }}</template>
      </AudioClipEditor>
      <p class="hint">{{ sk.editor.explanationAudioHint }}</p>
    </div>

    <FieldError :message="errors['explanation.content']" />
  </div>
</template>

<style scoped>
.ee {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.ee__text {
  width: 100%;
  resize: vertical;
}

.ee__media {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-2);
}

.ee__media-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s-2);
}

.ee__image {
  max-width: 100%;
  max-height: calc(var(--h-hotspot-max) / 2);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}
</style>
