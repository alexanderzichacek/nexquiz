<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useTemplateRef } from "vue";
import { sk } from "@/i18n/sk";

/** "⋯" menu of one quiz row: edit, duplicate, delete. */
defineProps<{ label: string }>();
const emit = defineEmits<{ edit: []; duplicate: []; delete: [] }>();

const open = ref(false);
const rootEl = useTemplateRef<HTMLElement>("rootEl");
const toggleEl = useTemplateRef<HTMLButtonElement>("toggleEl");

function onDocumentPointer(event: PointerEvent): void {
  if (rootEl.value && event.target instanceof Node && !rootEl.value.contains(event.target)) close(false);
}

function onKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape") close(true);
}

async function toggle(): Promise<void> {
  if (open.value) {
    close(false);
    return;
  }
  open.value = true;
  document.addEventListener("pointerdown", onDocumentPointer);
  await nextTick();
  rootEl.value?.querySelector<HTMLButtonElement>(".menu__item")?.focus();
}

function close(returnFocus: boolean): void {
  open.value = false;
  document.removeEventListener("pointerdown", onDocumentPointer);
  if (returnFocus) toggleEl.value?.focus();
}

function pick(action: "edit" | "duplicate" | "delete"): void {
  close(true);
  if (action === "edit") emit("edit");
  else if (action === "duplicate") emit("duplicate");
  else emit("delete");
}

onBeforeUnmount(() => document.removeEventListener("pointerdown", onDocumentPointer));
</script>

<template>
  <div ref="rootEl" class="menu" @keydown="onKeydown">
    <button
      ref="toggleEl"
      type="button"
      class="menu__toggle"
      :aria-label="label"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      ⋯
    </button>
    <div v-if="open" class="menu__list" role="menu">
      <button type="button" role="menuitem" class="menu__item" @click="pick('edit')">{{ sk.host.edit }}</button>
      <button type="button" role="menuitem" class="menu__item" @click="pick('duplicate')">
        {{ sk.host.duplicate }}
      </button>
      <button type="button" role="menuitem" class="menu__item menu__item--danger" @click="pick('delete')">
        {{ sk.host.delete }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.menu {
  position: relative;
}

.menu__toggle {
  min-width: var(--tap-min);
  min-height: var(--btn-h);
  border: 0;
  border-radius: var(--radius);
  background: transparent;
  font-size: var(--fs-editor-question);
  font-weight: var(--fw-black);
  cursor: pointer;
}

.menu__toggle:hover,
.menu__toggle[aria-expanded="true"] {
  background: var(--surface-2);
}

.menu__list {
  position: absolute;
  right: 0;
  top: calc(100% + var(--s-1));
  z-index: 20;
  display: flex;
  flex-direction: column;
  min-width: var(--w-menu);
  padding: var(--s-1);
  background: var(--surface);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-lg);
}

.menu__item {
  min-height: var(--btn-h);
  padding: 0 var(--s-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.menu__item:hover,
.menu__item:focus-visible {
  background: var(--surface-2);
}

.menu__item--danger {
  color: var(--danger);
}
</style>
