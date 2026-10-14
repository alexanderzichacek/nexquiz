<script setup lang="ts">
import type { Clip, TextQuestion } from "@nexquiz/shared";
import { sk } from "@/i18n/sk";
import AliasChips from "./AliasChips.vue";
import AnswerTester from "./AnswerTester.vue";
import AudioClipEditor from "./AudioClipEditor.vue";
import { DEFAULT_CLIP } from "./defaults";
import FieldError from "./FieldError.vue";
import type { ErrorMap } from "./validation";

/** `text` question: optional audio clip (e.g. a song for "fill in the lyrics"), accepted aliases + answer tester. */
const question = defineModel<TextQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();

/** Audio and video would play at once on the host screen, so uploading audio drops the video. */
function onAudioUploaded(audioId: string): void {
  const media = { ...question.value.media, audioId };
  delete media.videoId;
  question.value.media = media;
  question.value.data.clip ??= { ...DEFAULT_CLIP };
}

function removeAudio(): void {
  const media = { ...question.value.media };
  delete media.audioId;
  question.value.media = media.imageId || media.videoId ? media : undefined;
  delete question.value.data.clip;
}

function setClip(clip: Clip): void {
  question.value.data.clip = clip;
}
</script>

<template>
  <div class="stack">
    <div>
      <AudioClipEditor
        :key="question.id"
        :audio-id="question.media?.audioId"
        :clip="question.data.clip"
        :errors="errors"
        removable
        @uploaded="onAudioUploaded"
        @remove="removeAudio"
        @update:clip="setClip"
      >
        <template #label>{{ sk.editor.textAudio }}</template>
      </AudioClipEditor>
      <p class="hint">{{ sk.editor.textAudioHint }}</p>
    </div>
    <div>
      <span class="label">{{ sk.editor.aliases }}</span>
      <AliasChips
        v-model="question.data.fields[0].accepted"
        :label="sk.editor.aliases"
        :invalid="!!errors['data.fields.0.accepted']"
      />
      <p class="hint">{{ sk.editor.aliasHint }}</p>
      <FieldError :message="errors['data.fields.0.accepted']" />
    </div>
    <AnswerTester :accepted="question.data.fields[0].accepted" :tolerance="question.data.tolerance" />
  </div>
</template>
