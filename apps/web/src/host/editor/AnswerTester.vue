<script setup lang="ts">
import { isMatch, LIMITS, type Tolerance } from "@nexquiz/shared";
import { computed, ref } from "vue";
import { sk } from "@/i18n/sk";

/**
 * „Otestuj odpoveď“: preview of the fuzzy rules in the editor only.
 * The real decision is always made by the server.
 */
const props = defineProps<{ accepted: readonly string[]; tolerance: Tolerance }>();

const input = ref("");
const result = computed<boolean | null>(() =>
  input.value.trim() === "" ? null : isMatch(input.value, props.accepted, props.tolerance),
);
</script>

<template>
  <div class="tester">
    <label class="tester__field">
      <span class="label">{{ sk.editor.testAnswer }}</span>
      <input
        v-model="input"
        class="input"
        :maxlength="LIMITS.textAnswer.max"
        :placeholder="sk.editor.testPlaceholder"
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
      />
    </label>
    <span
      v-if="result !== null"
      class="tester__result"
      :class="result ? 'tester__result--ok' : 'tester__result--ko'"
      aria-live="polite"
    >
      {{ result ? sk.editor.testMatch : sk.editor.testNoMatch }}
    </span>
  </div>
</template>

<style scoped>
.tester {
  display: flex;
  align-items: flex-end;
  gap: var(--s-3);
}

.tester__field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.tester__result {
  min-height: var(--btn-h);
  display: inline-flex;
  align-items: center;
  padding: 0 var(--s-3);
  border-radius: var(--radius-sm);
  font-weight: var(--fw-bold);
  white-space: nowrap;
}

.tester__result--ok {
  color: var(--success);
  background: color-mix(in srgb, var(--success) 12%, transparent);
}

.tester__result--ko {
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 12%, transparent);
}
</style>
