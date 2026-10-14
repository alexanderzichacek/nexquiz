<script setup lang="ts">
import type { NumberMode } from "@nexquiz/shared";
import { computed, ref } from "vue";
import { format, sk } from "@/i18n/sk";
import { formatNumber, parseNumberInput } from "@/lib/number";
import SubmitBar from "./SubmitBar.vue";

/**
 * `number` question: one numeric input (decimal keypad, comma or dot) and a
 * ± button, because mobile decimal keypads have no minus. The hint tells how
 * the points are decided; the correct number is never part of it.
 */
const props = defineProps<{ mode: NumberMode; tolerance: number; locked: boolean }>();
const emit = defineEmits<{ submit: [value: number] }>();

const raw = ref("");
const touched = ref(false);

const value = computed(() => parseNumberInput(raw.value));
const empty = computed(() => raw.value.trim() === "");
const invalid = computed(() => touched.value && !empty.value && value.value === null);

const hint = computed(() => {
  if (props.mode === "closest") return sk.play.numberClosestHint;
  if (props.tolerance === 0) return sk.play.numberExactHint;
  return format(sk.play.numberToleranceHint, { tolerance: `±${formatNumber(props.tolerance)}` });
});

function toggleSign(): void {
  const trimmed = raw.value.trim();
  raw.value = /^[-−]/.test(trimmed) ? trimmed.slice(1) : `-${trimmed}`;
  touched.value = true;
}

function submit(): void {
  touched.value = true;
  if (props.locked || value.value === null) return;
  // Blur first, so the mobile keyboard closes and the overlay is visible.
  (document.activeElement as HTMLElement | null)?.blur();
  emit("submit", value.value);
}
</script>

<template>
  <div class="number-answer">
    <form class="number" @submit.prevent="submit">
      <p class="number__hint">{{ hint }}</p>
      <div class="number__row">
        <button type="button" class="number__sign" :aria-label="sk.play.numberSign" :disabled="locked" @click="toggleSign">
          ±
        </button>
        <input
          v-model="raw"
          class="number__input tabular"
          :class="{ 'number__input--error': invalid }"
          type="text"
          inputmode="decimal"
          :aria-label="sk.play.numberPlaceholder"
          :aria-invalid="invalid"
          :placeholder="sk.play.numberPlaceholder"
          :disabled="locked"
          maxlength="24"
          enterkeyhint="send"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          @input="touched = true"
        />
      </div>
      <p v-if="invalid" class="number__error" role="alert">{{ sk.play.numberInvalid }}</p>
    </form>
    <SubmitBar :disabled="locked || value === null" @submit="submit" />
  </div>
</template>

<style scoped>
.number-answer {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.number {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.number__hint {
  text-align: center;
  color: var(--text-muted);
}

.number__row {
  display: flex;
  gap: var(--s-2);
}

.number__sign {
  flex: none;
  min-width: var(--input-h);
  min-height: var(--input-h);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--fs-player-option);
  font-weight: var(--fw-bold);
}

.number__sign:disabled {
  opacity: var(--opacity-disabled);
}

.number__input {
  flex: 1;
  min-width: 0;
  min-height: var(--input-h);
  padding: 0 var(--s-4);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--fs-player-option);
}

.number__input:focus-visible {
  border-color: var(--primary);
}

.number__input--error {
  border-color: var(--danger);
}

.number__input:disabled {
  opacity: var(--opacity-disabled);
}

.number__error {
  color: var(--danger);
  font-size: var(--fs-label);
}
</style>
