<script setup lang="ts">
import { isQuestion, LIMITS, SCORING_MODES, TOLERANCES, type Question, type QuizUpdateRequest } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { inputNumber } from "@/lib/forms";
import FieldError from "./FieldError.vue";
import { useQuizEditorStore } from "./store";

/** Right panel: settings of the selected question and of the whole quiz, game start. */
const quiz = defineModel<QuizUpdateRequest>("quiz", { required: true });
const props = defineProps<{ question: Question | null; starting: boolean }>();
const emit = defineEmits<{ start: [] }>();

const editor = useQuizEditorStore();
const errors = computed(() => (props.question ? editor.errorsOf(props.question.id) : {}));

const SCORING_LABELS = { partial: sk.editor.scoringPartial, all: sk.editor.scoringAll } as const;
const TOLERANCE_LABELS = {
  strict: sk.editor.toleranceStrict,
  normal: sk.editor.toleranceNormal,
  loose: sk.editor.toleranceLoose,
} as const;

/** The selected question as stored in the draft (mutable). */
const current = computed<Question | null>(() => {
  const item = quiz.value.questions.find((q) => q.id === props.question?.id);
  return item && isQuestion(item) ? item : null;
});

const startBlocked = computed<string | null>(() => {
  // A quiz of pages only has nothing to play.
  if (!quiz.value.questions.some(isQuestion)) return sk.editor.startBlockedEmpty;
  if (!editor.validation.valid) return sk.editor.startBlockedInvalid;
  return null;
});

function setTimeLimit(event: Event): void {
  if (current.value) current.value.timeLimit = inputNumber(event);
}

function setPoints(event: Event): void {
  if (current.value) current.value.points = inputNumber(event);
}

function onDescription(event: Event): void {
  const value = (event.target as HTMLTextAreaElement).value;
  quiz.value.description = value === "" ? null : value;
}
</script>

<template>
  <aside class="settings">
    <section v-if="current" class="settings__group">
      <h2 class="settings__title">{{ sk.editor.settings }}</h2>

      <label class="row">
        <span class="row__label">{{ sk.editor.timeLimit }}</span>
        <input
          type="number"
          class="input input--narrow tabular"
          :class="{ 'input--error': errors.timeLimit }"
          :value="current.timeLimit"
          :min="LIMITS.timeLimit.min"
          :max="LIMITS.timeLimit.max"
          step="1"
          @input="setTimeLimit"
        />
        <span>{{ sk.editor.seconds }}</span>
      </label>
      <FieldError :message="errors.timeLimit" />

      <label class="row">
        <span class="row__label">{{ sk.editor.points }}</span>
        <input
          type="number"
          class="input input--narrow tabular"
          :class="{ 'input--error': errors.points }"
          :value="current.points"
          :min="LIMITS.points.min"
          :max="LIMITS.points.max"
          step="50"
          @input="setPoints"
        />
      </label>
      <FieldError :message="errors.points" />

      <fieldset v-if="current.type === 'multi' || current.type === 'order'" class="radios">
        <legend class="label">{{ sk.editor.scoring }}</legend>
        <label v-for="mode in SCORING_MODES" :key="mode" class="radio">
          <input v-model="current.data.scoring" type="radio" :name="`scoring-${current.id}`" :value="mode" />
          {{ SCORING_LABELS[mode] }}
        </label>
      </fieldset>

      <fieldset v-if="current.type === 'text' || current.type === 'music'" class="radios">
        <legend class="label">{{ sk.editor.tolerance }}</legend>
        <label v-for="t in TOLERANCES" :key="t" class="radio">
          <input v-model="current.data.tolerance" type="radio" :name="`tolerance-${current.id}`" :value="t" />
          {{ TOLERANCE_LABELS[t] }}
        </label>
      </fieldset>
    </section>

    <section class="settings__group">
      <h2 class="settings__title settings__title--divider">{{ sk.editor.quizSection }}</h2>
      <label class="stack-sm">
        <span class="label">{{ sk.editor.description }}</span>
        <textarea
          class="input settings__desc"
          :class="{ 'input--error': editor.validation.quiz.description }"
          :value="quiz.description ?? ''"
          rows="3"
          :maxlength="LIMITS.quizDescription.max"
          @input="onDescription"
        ></textarea>
      </label>
      <FieldError :message="editor.validation.quiz.description" />
      <label class="check">
        <input v-model="quiz.settings.speedBonus" type="checkbox" />
        {{ sk.editor.speedBonus }}
      </label>
      <label class="check">
        <input v-model="quiz.settings.showLeaderboardAfterEach" type="checkbox" />
        {{ sk.editor.showLeaderboardAfterEach }}
      </label>
      <label class="check">
        <input v-model="quiz.settings.shuffleOptions" type="checkbox" />
        {{ sk.editor.shuffleOptions }}
      </label>
    </section>

    <div class="settings__start">
      <BaseButton variant="primary" block :disabled="startBlocked !== null" :loading="starting" @click="emit('start')">
        {{ sk.editor.startGame }}
      </BaseButton>
      <p v-if="startBlocked" class="hint">{{ startBlocked }}</p>
    </div>
  </aside>
</template>

<style scoped>
.settings {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
}

.settings__group {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.settings__title {
  font-size: var(--fs-editor-option);
  font-weight: var(--fw-bold);
}

.settings__title--divider {
  padding-top: var(--s-4);
  border-top: var(--border-w) solid var(--border);
}

.row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}

.row__label {
  min-width: var(--s-7);
  font-weight: var(--fw-semibold);
}

.radios {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
  border: 0;
}

.radio,
.check {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: var(--s-6);
  cursor: pointer;
}

.radio input,
.check input {
  width: var(--s-4);
  height: var(--s-4);
  accent-color: var(--primary);
}

.stack-sm {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.settings__desc {
  width: 100%;
  padding: var(--s-2) var(--s-3);
  resize: vertical;
}

.settings__start {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
</style>
