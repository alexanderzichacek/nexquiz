<script setup lang="ts">
import { NUMBER_MODES, type NumberMode, type NumberQuestion } from "@nexquiz/shared";
import { ref } from "vue";
import { sk } from "@/i18n/sk";
import { parseNumberInput } from "@/lib/number";
import FieldError from "./FieldError.vue";
import type { ErrorMap } from "./validation";

/**
 * `number` question: the correct number and who scores — the nearest guess(es)
 * or every guess within a tolerance. Unparsable input becomes NaN, which fails
 * validation and shows the inline error (as the other numeric inputs do).
 */
const question = defineModel<NumberQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();

const MODE_LABELS: Record<NumberMode, string> = {
  closest: sk.editor.numberModeClosest,
  tolerance: sk.editor.numberModeTolerance,
};
const MODE_HINTS: Record<NumberMode, string> = {
  closest: sk.editor.numberModeClosestHint,
  tolerance: sk.editor.numberModeToleranceHint,
};

// Raw text is kept apart from the parsed value, so "2026." or "-" can be typed on the way to a number.
const answerRaw = ref(Number.isFinite(question.value.data.answer) ? String(question.value.data.answer) : "");
const toleranceRaw = ref(Number.isFinite(question.value.data.tolerance) ? String(question.value.data.tolerance) : "");

function setAnswer(event: Event): void {
  answerRaw.value = (event.target as HTMLInputElement).value;
  question.value.data.answer = parseNumberInput(answerRaw.value) ?? Number.NaN;
}

function setTolerance(event: Event): void {
  toleranceRaw.value = (event.target as HTMLInputElement).value;
  question.value.data.tolerance = parseNumberInput(toleranceRaw.value) ?? Number.NaN;
}
</script>

<template>
  <div class="stack">
    <div>
      <label class="label" :for="`number-answer-${question.id}`">{{ sk.editor.numberAnswer }}</label>
      <input
        :id="`number-answer-${question.id}`"
        class="input tabular"
        :class="{ 'input--error': errors['data.answer'] }"
        type="text"
        inputmode="decimal"
        :value="answerRaw"
        :placeholder="sk.editor.numberAnswerPlaceholder"
        autocomplete="off"
        @input="setAnswer"
      />
      <p class="hint">{{ sk.editor.numberFormatHint }}</p>
      <FieldError :message="errors['data.answer']" />
    </div>

    <fieldset class="number-mode">
      <legend class="label">{{ sk.editor.numberMode }}</legend>
      <label v-for="mode in NUMBER_MODES" :key="mode" class="number-mode__option">
        <input v-model="question.data.mode" type="radio" :name="`number-mode-${question.id}`" :value="mode" />
        <span>
          <strong>{{ MODE_LABELS[mode] }}</strong>
          <span class="hint number-mode__hint">{{ MODE_HINTS[mode] }}</span>
        </span>
      </label>
    </fieldset>

    <div v-if="question.data.mode === 'tolerance'">
      <label class="label" :for="`number-tolerance-${question.id}`">{{ sk.editor.numberTolerance }}</label>
      <input
        :id="`number-tolerance-${question.id}`"
        class="input input--narrow tabular"
        :class="{ 'input--error': errors['data.tolerance'] }"
        type="text"
        inputmode="decimal"
        :value="toleranceRaw"
        autocomplete="off"
        @input="setTolerance"
      />
      <p class="hint">{{ sk.editor.numberToleranceHint }}</p>
      <FieldError :message="errors['data.tolerance']" />
    </div>
  </div>
</template>

<style scoped>
.number-mode {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.number-mode__option {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
  cursor: pointer;
}

.number-mode__option input {
  width: var(--s-4);
  height: var(--s-4);
  margin-top: var(--s-1);
  accent-color: var(--primary);
}

.number-mode__hint {
  display: block;
}
</style>
