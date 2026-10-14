<script setup lang="ts">
import type { PageShowEvent } from "@nexquiz/shared";
import { computed } from "vue";
import { PAGE_TITLE_FIT, charCount, textFit } from "@/components/choiceLayout";
import { mediaUrl } from "@/lib/forms";

/**
 * Page between questions on the player's phone: the same title, description
 * and image as on the host screen. Fits the screen: a long title scales down,
 * the image shrinks and a long description scrolls inside its own box.
 */
const props = defineProps<{ page: PageShowEvent }>();

const titleFit = computed(() => textFit(charCount(props.page.title), PAGE_TITLE_FIT));
</script>

<template>
  <section class="pp" role="status">
    <h1 v-if="page.title" class="pp__title line-clamp" :class="`fit-${titleFit}`">{{ page.title }}</h1>
    <p v-if="page.description" class="pp__description">{{ page.description }}</p>
    <img v-if="page.media.imageId" :src="mediaUrl(page.media.imageId)" alt="" class="pp__image" />
  </section>
</template>

<style scoped>
.pp {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  flex: 1;
  min-height: 0;
  text-align: center;
}

.pp__title {
  --lines: 4;
  flex: none;
  font-size: max(var(--fs-player-question), calc(var(--fs-player-pin) * var(--fit, 1)));
  font-weight: var(--fw-black);
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.pp__description {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  font-size: var(--fs-player-question);
  color: var(--text-muted);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.pp__image {
  flex: 0 1 40dvh;
  width: 100%;
  min-height: var(--s-8);
  object-fit: contain;
  border-radius: var(--radius);
}
</style>
