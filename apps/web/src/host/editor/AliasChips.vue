<script setup lang="ts">
import { LIMITS } from "@nexquiz/shared";
import { ref } from "vue";
import { format, sk } from "@/i18n/sk";

/** Accepted aliases as chips; Enter (or leaving the input) adds the typed alias. */
const aliases = defineModel<string[]>({ required: true });
defineProps<{ invalid?: boolean; label: string }>();

const pending = ref("");

function commit(): void {
  const value = pending.value.trim();
  pending.value = "";
  if (!value || aliases.value.length >= LIMITS.aliases.max) return;
  if (aliases.value.some((a) => a.toLowerCase() === value.toLowerCase())) return;
  aliases.value = [...aliases.value, value];
}

function removeAt(index: number): void {
  aliases.value = aliases.value.filter((_, i) => i !== index);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Enter" || event.key === ",") {
    event.preventDefault();
    commit();
  } else if (event.key === "Backspace" && pending.value === "" && aliases.value.length > 0) {
    removeAt(aliases.value.length - 1);
  }
}
</script>

<template>
  <div class="chips" :class="{ 'chips--error': invalid }">
    <span v-for="(alias, index) in aliases" :key="`${index}-${alias}`" class="chip">
      {{ alias }}
      <button
        type="button"
        class="chip__remove"
        :aria-label="format(sk.editor.removeAlias, { alias })"
        @click="removeAt(index)"
      >
        ×
      </button>
    </span>
    <input
      v-model="pending"
      class="chips__input"
      :maxlength="LIMITS.alias.max"
      :placeholder="sk.editor.aliasPlaceholder"
      :aria-label="label"
      :title="sk.editor.aliasHint"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      @keydown="onKeydown"
      @blur="commit"
    />
  </div>
</template>

<style scoped>
.chips {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--s-2);
  min-height: var(--btn-h);
  padding: var(--s-1) var(--s-2);
  background: var(--bg);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
}

.chips:focus-within {
  border-color: var(--primary);
}

.chips--error {
  border-color: var(--danger);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  padding: var(--s-1) var(--s-1) var(--s-1) var(--s-3);
  border-radius: var(--radius-lg);
  background: var(--surface-2);
  font-size: var(--fs-editor-option);
}

.chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--s-5);
  min-height: var(--s-5);
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.chip__remove:hover {
  background: var(--border);
  color: var(--text);
}

.chips__input {
  flex: 1;
  min-width: var(--w-chip-input);
  min-height: var(--s-6);
  border: 0;
  background: transparent;
  outline: none;
}
</style>
