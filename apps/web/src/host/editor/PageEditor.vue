<script setup lang="ts">
import { LIMITS, type MediaUploadResponse, type Page } from "@nexquiz/shared";
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import FieldError from "./FieldError.vue";
import MediaUpload from "./MediaUpload.vue";
import { useQuizEditorStore } from "./store";

/** Center panel for a page between questions: title, description and image (at least one of them). */
const page = defineModel<Page>({ required: true });
const props = defineProps<{ index: number; total: number }>();

const editor = useQuizEditorStore();
const errors = computed(() => editor.errorsOf(page.value.id));
const imageId = computed(() => page.value.media?.imageId);
const titleId = computed(() => `page-title-${page.value.id}`);
const descriptionId = computed(() => `page-description-${page.value.id}`);

function onImageUploaded(media: MediaUploadResponse): void {
  page.value.media = { imageId: media.id };
}

function removeImage(): void {
  page.value.media = undefined;
}
</script>

<template>
  <section class="pe" :aria-label="format(sk.editor.pageEditorLabel, { index: props.index + 1, total: props.total })">
    <p class="hint">{{ sk.editor.pageHint }}</p>

    <div>
      <label class="label" :for="titleId">{{ sk.editor.pageTitleLabel }}</label>
      <input
        :id="titleId"
        v-model="page.title"
        class="input"
        :class="{ 'input--error': errors.pageTitle }"
        :maxlength="LIMITS.pageTitle.max"
        :placeholder="sk.editor.pageTitlePlaceholder"
      />
      <FieldError :message="errors.pageTitle" />
    </div>

    <div>
      <label class="label" :for="descriptionId">{{ sk.editor.pageDescriptionLabel }}</label>
      <textarea
        :id="descriptionId"
        v-model="page.description"
        class="input pe__description"
        :class="{ 'input--error': errors.pageDescription }"
        rows="4"
        :maxlength="LIMITS.pageDescription.max"
        :placeholder="sk.editor.pageDescriptionPlaceholder"
      ></textarea>
      <FieldError :message="errors.pageDescription" />
    </div>

    <div class="pe__media">
      <span class="label">{{ sk.editor.pageImageLabel }}</span>
      <img v-if="imageId" :src="mediaUrl(imageId)" alt="" class="pe__image" />
      <MediaUpload kind="image" :has-media="!!imageId" @uploaded="onImageUploaded" @remove="removeImage" />
    </div>

    <FieldError :message="errors.content" />
  </section>
</template>

<style scoped>
.pe {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.pe__description {
  resize: vertical;
}

.pe__media {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-2);
}

.pe__image {
  max-width: 100%;
  max-height: calc(var(--h-hotspot-max) / 2);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}
</style>
