<script setup lang="ts">
import { type MusicQuestion } from "@nexquiz/shared";
import { format, sk } from "@/i18n/sk";
import { formatScore } from "@/lib/format";
import { inputNumber } from "@/lib/forms";
import AliasChips from "./AliasChips.vue";
import AnswerTester from "./AnswerTester.vue";
import AudioClipEditor from "./AudioClipEditor.vue";
import FieldError from "./FieldError.vue";
import type { ErrorMap } from "./validation";

/** `music` question: audio upload + clip (see `AudioClipEditor`), two weighted alias fields. */
const question = defineModel<MusicQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();

function onWeight(index: 0 | 1, event: Event): void {
  question.value.data.fields[index].weight = inputNumber(event);
}

function fieldPoints(weight: number): string {
  const value = weight * question.value.points;
  return Number.isFinite(value) ? formatScore(value) : "–";
}

const FIELD_INDEXES = [0, 1] as const;
</script>

<template>
  <div class="stack">
    <AudioClipEditor
      :key="question.id"
      :audio-id="question.media?.audioId"
      :clip="question.data.clip"
      :errors="errors"
      @uploaded="(id) => (question.media = { audioId: id })"
      @update:clip="(clip) => (question.data.clip = clip)"
    />

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
