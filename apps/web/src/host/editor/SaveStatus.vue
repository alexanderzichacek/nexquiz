<script setup lang="ts">
import { computed } from "vue";
import { sk } from "@/i18n/sk";
import { useQuizEditorStore } from "./store";

/** Autosave state: „Ukladám…“ → „Uložené ✓“ / „Chyba ukladania – skúsiť znova“. */
const editor = useQuizEditorStore();

const text = computed(() => {
  switch (editor.status) {
    case "pending":
    case "saving":
      return sk.editor.saving;
    case "saved":
      return sk.editor.saved;
    case "invalid":
      return sk.editor.saveInvalid;
    default:
      return "";
  }
});
</script>

<template>
  <span class="save" aria-live="polite">
    <button v-if="editor.status === 'error'" type="button" class="save__retry" @click="editor.save()">
      {{ sk.editor.saveError }}
    </button>
    <span v-else class="save__text" :class="`save__text--${editor.status}`">{{ text }}</span>
  </span>
</template>

<style scoped>
.save {
  font-size: var(--fs-editor-label);
}

.save__text {
  color: var(--text-muted);
}

.save__text--saved {
  color: var(--success);
}

.save__text--invalid {
  color: var(--danger);
}

.save__retry {
  min-height: var(--btn-h);
  padding: 0 var(--s-3);
  border: var(--border-w) solid var(--danger);
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--danger);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}
</style>
