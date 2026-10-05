<script setup lang="ts">
import { onMounted, useTemplateRef, watch } from "vue";
import { sk } from "@/i18n/sk";

/** Modal built on the native `<dialog>` (focus trap, Escape, backdrop). */
const open = defineModel<boolean>("open", { required: true });
withDefaults(defineProps<{ title: string; wide?: boolean }>(), { wide: false });

const dialogEl = useTemplateRef<HTMLDialogElement>("dialogEl");

function sync(): void {
  const el = dialogEl.value;
  if (!el) return;
  if (open.value && !el.open) el.showModal();
  if (!open.value && el.open) el.close();
}

watch(open, sync);
onMounted(sync);

function onBackdropClick(event: MouseEvent): void {
  if (event.target === dialogEl.value) open.value = false;
}
</script>

<template>
  <dialog
    ref="dialogEl"
    class="dialog"
    :class="{ 'dialog--wide': wide }"
    :aria-label="title"
    @close="open = false"
    @click="onBackdropClick"
  >
    <div class="dialog__body">
      <header class="dialog__header">
        <h2 class="dialog__title">{{ title }}</h2>
        <button type="button" class="dialog__close" :aria-label="sk.common.close" @click="open = false">×</button>
      </header>
      <slot />
      <footer v-if="$slots.actions" class="dialog__actions">
        <slot name="actions" />
      </footer>
    </div>
  </dialog>
</template>

<style scoped>
.dialog {
  width: min(calc(100% - 2 * var(--s-4)), var(--w-dialog));
  max-height: calc(100dvh - 2 * var(--s-4));
  padding: 0;
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow-lg);
}

.dialog--wide {
  width: min(calc(100% - 2 * var(--s-4)), var(--w-landing));
}

.dialog::backdrop {
  background: var(--overlay);
}

.dialog__body {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  padding: var(--s-5);
}

.dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}

.dialog__title {
  font-size: var(--fs-editor-question);
  font-weight: var(--fw-bold);
}

.dialog__close {
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  margin: calc(-1 * var(--s-3));
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  font-size: var(--fs-claim);
  cursor: pointer;
}

.dialog__close:hover {
  background: var(--surface-2);
}

.dialog__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--s-2);
}
</style>
