<script setup lang="ts">
import { LIMITS, type PublicField } from "@nexquiz/shared";
import { computed, nextTick, reactive, useTemplateRef } from "vue";
import { sk } from "@/i18n/sk";
import SubmitBar from "./SubmitBar.vue";

type FieldKey = PublicField["key"];

/**
 * `text` (one input) and `music` (Interpret + Názov skladby). Enter in the
 * first field moves the focus to the next one, Enter in the last submits.
 */
const props = defineProps<{
  type: "text" | "music";
  fields: readonly PublicField[];
  locked: boolean;
  /** The question has audio played on the host screen (always for `music`, optionally for `text`). */
  listen?: boolean;
}>();
const emit = defineEmits<{ submit: [answers: Partial<Record<FieldKey, string>>] }>();

const values = reactive<Partial<Record<FieldKey, string>>>({});
const inputs = useTemplateRef<HTMLInputElement[]>("inputs");

const empty = computed(() => props.fields.every((f) => (values[f.key] ?? "").trim() === ""));

function label(field: PublicField): string {
  return field.label ?? sk.fields[field.key];
}

function submit(): void {
  if (props.locked || empty.value) return;
  const answers: Partial<Record<FieldKey, string>> = {};
  for (const f of props.fields) answers[f.key] = (values[f.key] ?? "").trim();
  // Blur first, so the mobile keyboard closes and the overlay is visible.
  (document.activeElement as HTMLElement | null)?.blur();
  emit("submit", answers);
}

async function onEnter(index: number): Promise<void> {
  const next = inputs.value?.[index + 1];
  if (next) {
    await nextTick();
    next.focus();
    return;
  }
  submit();
}
</script>

<template>
  <div class="text-answer">
    <template v-if="listen || type === 'music'">
      <!-- The player page puts the clip player here when the player has sound on. -->
      <slot name="listen">
        <p class="text__listen">{{ sk.play.listen }}</p>
      </slot>
    </template>
    <form class="text" @submit.prevent="submit">
      <label v-for="(f, i) in fields" :key="f.key" class="text__field">
        <span v-if="type === 'music'" class="text__label">{{ label(f) }}</span>
        <input
          ref="inputs"
          v-model="values[f.key]"
          class="text__input"
          type="text"
          :aria-label="label(f)"
          :placeholder="type === 'text' ? sk.play.answerPlaceholder : undefined"
          :maxlength="LIMITS.textAnswer.max"
          :disabled="locked"
          :enterkeyhint="i < fields.length - 1 ? 'next' : 'send'"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          @keydown.enter.prevent="onEnter(i)"
        />
      </label>
    </form>
    <SubmitBar :disabled="locked || empty" @submit="submit" />
  </div>
</template>

<style scoped>
.text-answer {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  flex: 1;
  min-height: 0;
}

.text {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.text__listen {
  font-size: var(--fs-player-question);
  font-weight: var(--fw-bold);
  text-align: center;
}

.text__field {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.text__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.text__input {
  width: 100%;
  min-height: var(--input-h);
  padding: 0 var(--s-4);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--fs-player-option);
}

.text__input:focus-visible {
  border-color: var(--primary);
}

.text__input:disabled {
  opacity: var(--opacity-disabled);
}
</style>
