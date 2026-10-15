<script setup lang="ts">
import type { ExplanationShowEvent } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { PAGE_DESCRIPTION_FIT, charCount, textFit } from "@/components/choiceLayout";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import AudioControl from "./AudioControl.vue";

/**
 * Explanation of the revealed question on the host screen: label with the
 * question, the text, an image or a video and the audio clip, then Ďalej.
 * The text scales down with its length, the image / video take the free
 * height and a very long text scrolls inside its own box.
 */
const props = defineProps<{ explanation: ExplanationShowEvent; advancing: boolean }>();
defineEmits<{ next: [] }>();

const textFitLevel = computed(() => textFit(charCount(props.explanation.text), PAGE_DESCRIPTION_FIT));
const imageId = computed(() => props.explanation.media.imageId);
const videoId = computed(() => props.explanation.media.videoId);
const audioId = computed(() => props.explanation.media.audioId);
</script>

<template>
  <section class="explanation">
    <header class="explanation__head">
      <span class="explanation__label">{{ format(sk.game.explanationLabel, { number: explanation.number }) }}</span>
      <p class="explanation__prompt line-clamp">{{ explanation.prompt }}</p>
    </header>

    <div class="explanation__body">
      <p v-if="explanation.text" class="explanation__text" :class="`fit-${textFitLevel}`">{{ explanation.text }}</p>
      <img v-if="imageId" :src="mediaUrl(imageId)" alt="" class="explanation__media" />
      <video
        v-else-if="videoId"
        :src="mediaUrl(videoId)"
        class="explanation__media"
        controls
        autoplay
        playsinline
        preload="auto"
      ></video>
      <AudioControl v-if="audioId && explanation.clip" :audio-id="audioId" :clip="explanation.clip" />
    </div>

    <footer class="explanation__footer">
      <BaseButton variant="primary" large class="explanation__next" :loading="advancing" @click="$emit('next')">
        {{ sk.game.next }}
      </BaseButton>
    </footer>
  </section>
</template>

<style scoped>
.explanation {
  display: flex;
  flex-direction: column;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
}

.explanation__head {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-1);
  text-align: center;
}

.explanation__label {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-bold);
  color: var(--primary);
  text-transform: uppercase;
}

.explanation__prompt {
  --lines: 2;
  font-size: var(--fs-host-body);
  color: var(--text-muted);
  overflow-wrap: anywhere;
}

.explanation__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
  text-align: center;
}

.explanation__text {
  flex: 0 1 auto;
  min-height: 0;
  max-width: 70ch;
  overflow-y: auto;
  font-size: calc(var(--fs-host-option) * var(--fit, 1));
  font-weight: var(--fw-semibold);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.explanation__media {
  flex: 1 1 0;
  width: 100%;
  min-height: var(--stage-media-min);
  max-height: 45vh;
  object-fit: contain;
}

.explanation__footer {
  flex: none;
  display: flex;
  justify-content: flex-end;
}

.explanation__next {
  font-size: var(--fs-host-option);
  padding: 0 var(--s-7);
}
</style>
