<script setup lang="ts">
import { LIMITS, QUESTION_TYPES, type MediaUploadResponse, type Question, type QuestionType } from "@nexquiz/shared";
import { computed, ref } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { useConfirmStore } from "@/stores/confirm";
import ChoiceEditor from "./ChoiceEditor.vue";
import { hasTypeSpecificContent, mediaKindsFor } from "./defaults";
import FieldError from "./FieldError.vue";
import HotspotEditor from "./HotspotEditor.vue";
import MediaUpload from "./MediaUpload.vue";
import MusicEditor from "./MusicEditor.vue";
import OrderEditor from "./OrderEditor.vue";
import PlayerPreview from "./PlayerPreview.vue";
import SaveStatus from "./SaveStatus.vue";
import { useQuizEditorStore } from "./store";
import TextEditor from "./TextEditor.vue";

/** Center panel: type, prompt, media and the type-specific editor of the selected question. */
const question = defineModel<Question>({ required: true });
const props = defineProps<{ index: number; total: number }>();

const editor = useQuizEditorStore();
const confirm = useConfirmStore();
const previewOpen = ref(false);

const errors = computed(() => editor.errorsOf(question.value.id));
const kinds = computed(() => mediaKindsFor(question.value.type));
const imageId = computed(() => question.value.media?.imageId);
const promptId = computed(() => `prompt-${question.value.id}`);

async function onTypeChange(event: Event): Promise<void> {
  const select = event.target as HTMLSelectElement;
  const next = select.value as QuestionType;
  if (!QUESTION_TYPES.includes(next) || next === question.value.type) return;
  if (hasTypeSpecificContent(question.value)) {
    const ok = await confirm.ask({
      title: sk.editor.changeTypeTitle,
      message: sk.editor.changeTypeMessage,
      confirmLabel: sk.editor.changeTypeConfirm,
      cancelLabel: sk.common.cancel,
      danger: true,
    });
    if (!ok) {
      select.value = question.value.type;
      return;
    }
  }
  editor.changeType(question.value.id, next);
}

function onImageUploaded(media: MediaUploadResponse): void {
  question.value.media = { ...question.value.media, imageId: media.id };
}

function removeImage(): void {
  const media = { ...question.value.media };
  delete media.imageId;
  question.value.media = media.audioId ? media : undefined;
}
</script>

<template>
  <section class="qe" :aria-label="format(sk.editor.questionsToggle, { index: props.index + 1, total: props.total })">
    <label class="qe__type">
      <span>{{ sk.editor.type }}</span>
      <select class="input qe__select" :value="question.type" @change="onTypeChange">
        <option v-for="t in QUESTION_TYPES" :key="t" :value="t">
          {{ sk.questionTypes[t].short }} – {{ sk.questionTypes[t].label }}
        </option>
      </select>
    </label>

    <div>
      <label class="label" :for="promptId">{{ sk.editor.prompt }}</label>
      <textarea
        :id="promptId"
        v-model="question.prompt"
        class="input qe__prompt"
        :class="{ 'input--error': errors.prompt }"
        rows="2"
        :maxlength="LIMITS.prompt.max"
        :placeholder="sk.editor.promptPlaceholder"
      ></textarea>
      <FieldError :message="errors.prompt" />
    </div>

    <div v-if="kinds.image && !kinds.imageRequired" class="qe__media">
      <span class="label">{{ sk.editor.imageOptional }}</span>
      <img v-if="imageId" :src="mediaUrl(imageId)" alt="" class="qe__image" />
      <MediaUpload kind="image" :has-media="!!imageId" @uploaded="onImageUploaded" @remove="removeImage" />
      <FieldError :message="errors['media.imageId']" />
    </div>

    <ChoiceEditor
      v-if="question.type === 'single' || question.type === 'multi'"
      v-model="question"
      :errors="errors"
    />
    <OrderEditor v-else-if="question.type === 'order'" v-model="question" :errors="errors" />
    <HotspotEditor v-else-if="question.type === 'hotspot'" v-model="question" :errors="errors" />
    <TextEditor v-else-if="question.type === 'text'" v-model="question" :errors="errors" />
    <MusicEditor v-else-if="question.type === 'music'" v-model="question" :errors="errors" />

    <FieldError :message="errors.type" />

    <footer class="qe__foot">
      <BaseButton variant="secondary" @click="previewOpen = true">{{ sk.editor.preview }}</BaseButton>
      <SaveStatus />
    </footer>

    <PlayerPreview v-if="previewOpen" v-model:open="previewOpen" :question="question" :index="index" :total="total" />
  </section>
</template>

<style scoped>
.qe {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.qe__type {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  align-self: flex-start;
  font-weight: var(--fw-semibold);
}

.qe__select {
  min-width: var(--w-menu);
}

.qe__prompt {
  width: 100%;
  min-height: calc(var(--input-h) * 1.5);
  padding: var(--s-3);
  font-size: var(--fs-editor-question);
  font-weight: var(--fw-semibold);
  resize: vertical;
}

.qe__media {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--s-2);
}

.qe__image {
  max-width: 100%;
  max-height: calc(var(--h-hotspot-max) / 2);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.qe__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-3);
  padding-top: var(--s-4);
  border-top: var(--border-w) solid var(--border);
}
</style>
