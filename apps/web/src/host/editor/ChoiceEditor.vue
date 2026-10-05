<script setup lang="ts">
import { LIMITS, type MultiQuestion, type SingleQuestion } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import OptionShape from "@/components/OptionShape.vue";
import { optionColor, optionLetter } from "@/components/options";
import { format, sk } from "@/i18n/sk";
import { localId } from "@/lib/ids";
import FieldError from "./FieldError.vue";
import type { ErrorMap } from "./validation";

/** Options of a `single` (radio) or `multi` (checkbox) question, max. 6. */
const question = defineModel<SingleQuestion | MultiQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();

const options = computed(() => question.value.data.options);
const canAdd = computed(() => options.value.length < LIMITS.choiceOptions.max);
const canRemove = computed(() => options.value.length > LIMITS.choiceOptions.min);

function isCorrect(id: string): boolean {
  const q = question.value;
  return q.type === "single" ? q.data.correctId === id : q.data.correctIds.includes(id);
}

function toggleCorrect(id: string): void {
  const q = question.value;
  if (q.type === "single") {
    q.data.correctId = id;
  } else if (q.data.correctIds.includes(id)) {
    q.data.correctIds = q.data.correctIds.filter((c) => c !== id);
  } else {
    q.data.correctIds = [...q.data.correctIds, id];
  }
}

function addOption(): void {
  if (!canAdd.value) return;
  question.value.data.options.push({ id: localId(), text: "" });
}

function removeOption(id: string): void {
  if (!canRemove.value) return;
  const q = question.value;
  q.data.options = q.data.options.filter((o) => o.id !== id);
  if (q.type === "single") {
    if (q.data.correctId === id) q.data.correctId = q.data.options[0]?.id ?? "";
  } else {
    q.data.correctIds = q.data.correctIds.filter((c) => c !== id);
  }
}
</script>

<template>
  <fieldset class="choice">
    <legend class="label">{{ sk.editor.options }}</legend>
    <ul class="choice__list">
      <li v-for="(option, index) in options" :key="option.id" class="choice__row">
        <span class="choice__marker" :style="{ background: optionColor(index) }" aria-hidden="true">
          <OptionShape :index="index" />
          {{ optionLetter(index) }}
        </span>
        <div class="choice__field">
          <input
            v-model="option.text"
            class="input"
            :class="{ 'input--error': errors[`data.options.${index}.text`] }"
            :maxlength="LIMITS.optionText.max"
            :placeholder="format(sk.editor.optionPlaceholder, { letter: optionLetter(index) })"
            :aria-label="format(sk.editor.optionPlaceholder, { letter: optionLetter(index) })"
          />
          <FieldError :message="errors[`data.options.${index}.text`]" />
        </div>
        <label class="choice__correct">
          <input
            :type="question.type === 'single' ? 'radio' : 'checkbox'"
            :name="`correct-${question.id}`"
            :checked="isCorrect(option.id)"
            @change="toggleCorrect(option.id)"
          />
          <span class="visually-hidden">{{ format(sk.editor.correctOption, { letter: optionLetter(index) }) }}</span>
          <span aria-hidden="true" class="choice__check">✓</span>
        </label>
        <button
          type="button"
          class="icon-btn"
          :disabled="!canRemove"
          :aria-label="format(sk.editor.removeOption, { letter: optionLetter(index) })"
          @click="removeOption(option.id)"
        >
          ×
        </button>
      </li>
    </ul>
    <FieldError :message="errors['data.options'] ?? errors['data.correctId'] ?? errors['data.correctIds']" />
    <BaseButton v-if="canAdd" variant="ghost" @click="addOption">{{ sk.editor.addOption }}</BaseButton>
  </fieldset>
</template>

<style scoped>
.choice {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.choice__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.choice__row {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
}

.choice__marker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  min-width: var(--tap-min);
  min-height: var(--btn-h);
  padding: 0 var(--s-2);
  border-radius: var(--radius-sm);
  color: var(--on-option);
  font-weight: var(--fw-black);
}

.choice__field {
  flex: 1;
  min-width: 0;
}

.choice__correct {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: var(--btn-h);
  padding: 0 var(--s-2);
  border-radius: var(--radius-sm);
  cursor: pointer;
}

.choice__correct:has(input:checked) {
  background: color-mix(in srgb, var(--success) 15%, transparent);
  color: var(--success);
}

.choice__correct input {
  width: var(--s-5);
  height: var(--s-5);
  accent-color: var(--success);
}

.choice__check {
  font-weight: var(--fw-black);
}
</style>
