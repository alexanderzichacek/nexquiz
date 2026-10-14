<script setup lang="ts">
import type { PageShowEvent } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { PAGE_DESCRIPTION_FIT, PAGE_TITLE_FIT, charCount, textFit } from "@/components/choiceLayout";
import { sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";

/**
 * Page between questions on the host screen (e.g. a category divider): title,
 * description and image, then Ďalej. Long texts scale down, the image takes
 * the free height and a very long description scrolls inside its own box.
 */
const props = defineProps<{ page: PageShowEvent; advancing: boolean }>();
defineEmits<{ next: [] }>();

const titleFit = computed(() => textFit(charCount(props.page.title), PAGE_TITLE_FIT));
const descriptionFit = computed(() => textFit(charCount(props.page.description), PAGE_DESCRIPTION_FIT));
</script>

<template>
  <section class="page">
    <div class="page__body">
      <h1 v-if="page.title" class="page__title line-clamp" :class="`fit-${titleFit}`">{{ page.title }}</h1>
      <p v-if="page.description" class="page__description" :class="`fit-${descriptionFit}`">{{ page.description }}</p>
      <img v-if="page.media.imageId" :src="mediaUrl(page.media.imageId)" alt="" class="page__image" />
    </div>
    <footer class="page__footer">
      <BaseButton variant="primary" large class="page__next" :loading="advancing" @click="$emit('next')">
        {{ sk.game.next }}
      </BaseButton>
    </footer>
  </section>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
}

.page__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
  text-align: center;
}

.page__title {
  --lines: 3;
  flex: none;
  /* the huge title token scales twice as steeply as body texts */
  font-size: calc(var(--fs-host-pin) * var(--fit, 1) * var(--fit, 1));
  font-weight: var(--fw-black);
  line-height: 1.1;
  overflow-wrap: anywhere;
}

.page__description {
  flex: 0 1 auto;
  min-height: 0;
  max-width: 70ch;
  overflow-y: auto;
  font-size: calc(var(--fs-host-option) * var(--fit, 1));
  color: var(--text-muted);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.page__image {
  flex: 1 1 0;
  width: 100%;
  min-height: var(--stage-media-min);
  max-height: 45vh;
  object-fit: contain;
}

.page__footer {
  flex: none;
  display: flex;
  justify-content: flex-end;
}

.page__next {
  font-size: var(--fs-host-option);
  padding: 0 var(--s-7);
}
</style>
