<script setup lang="ts">
import type { ExplanationShowEvent } from "@nexquiz/shared";
import { computed } from "vue";
import { sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import PlayerClip from "./PlayerClip.vue";
import PlayerVideo from "./PlayerVideo.vue";
import { usePlayerMedia } from "./usePlayerMedia";

/**
 * Explanation of the revealed question on the player's phone: the same text
 * and image as on the host screen. With sound and video on, the video and the
 * audio clip play on this device too. Fits the screen: the image / video
 * shrink and a long text scrolls inside its own box.
 */
const props = defineProps<{ explanation: ExplanationShowEvent }>();

const media = usePlayerMedia();

const imageId = computed(() => props.explanation.media.imageId);
/** Shown in place of an image, only with sound and video on. */
const videoId = computed(() => (media.enabled.value ? props.explanation.media.videoId : undefined));
const clip = computed(() => (media.enabled.value ? props.explanation.clip : undefined));
</script>

<template>
  <section class="pe" role="status">
    <span class="pe__label">{{ sk.play.explanationLabel }}</span>
    <p v-if="explanation.text" class="pe__text">{{ explanation.text }}</p>
    <img v-if="imageId" :src="mediaUrl(imageId)" alt="" class="pe__media" />
    <PlayerVideo v-else-if="videoId" :video-id="videoId" class="pe__media" />
    <PlayerClip v-if="clip" :index="explanation.index" :duration="clip.duration" class="pe__clip" />
  </section>
</template>

<style scoped>
.pe {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  flex: 1;
  min-height: 0;
  text-align: center;
}

.pe__label {
  flex: none;
  font-weight: var(--fw-bold);
  color: var(--primary);
  text-transform: uppercase;
}

.pe__text {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  font-size: var(--fs-player-question);
  font-weight: var(--fw-semibold);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.pe__media {
  flex: 0 1 40dvh;
  width: 100%;
  min-height: var(--s-8);
  object-fit: contain;
  border-radius: var(--radius);
}

.pe__clip {
  flex: none;
  align-self: stretch;
}
</style>
