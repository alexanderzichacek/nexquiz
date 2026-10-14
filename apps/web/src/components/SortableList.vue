<script setup lang="ts" generic="T extends { id: string }">
import Draggable from "vuedraggable";
import { sk } from "@/i18n/sk";

/**
 * Reorderable list: drag & drop via the ⠿ handle (SortableJS) plus ↑↓ buttons
 * for keyboard, screen readers and imprecise touch. With `slotArrows` the
 * list does not render the ↑↓ buttons; the slot renders them itself from the
 * `move` / `first` / `last` slot props (narrow lists with own item actions).
 */
const items = defineModel<T[]>({ required: true });
withDefaults(
  defineProps<{
    disabled?: boolean;
    dense?: boolean;
    /** Player size: handle and ↑↓ buttons are ≥ 48 px tap targets. */
    large?: boolean;
    slotArrows?: boolean;
  }>(),
  { disabled: false, dense: false, large: false, slotArrows: false },
);

defineSlots<{
  default(props: { item: T; index: number; move: (delta: -1 | 1) => void; first: boolean; last: boolean }): unknown;
}>();

function move(index: number, delta: -1 | 1): void {
  const target = index + delta;
  if (target < 0 || target >= items.value.length) return;
  const next = items.value.slice();
  const [moved] = next.splice(index, 1);
  if (moved === undefined) return;
  next.splice(target, 0, moved);
  items.value = next;
}

function onUpdate(value: unknown[]): void {
  // vuedraggable only reorders the array it was given.
  items.value = value as T[];
}
</script>

<template>
  <Draggable
    :model-value="items"
    item-key="id"
    tag="ul"
    class="sortable"
    :class="{ 'sortable--dense': dense, 'sortable--large': large }"
    handle=".sortable__handle"
    ghost-class="sortable__ghost"
    chosen-class="sortable__chosen"
    drag-class="sortable__drag"
    :disabled="disabled"
    :animation="150"
    @update:model-value="onUpdate"
  >
    <template #item="{ element, index }: { element: T; index: number }">
      <li class="sortable__item">
        <span class="sortable__handle" :title="sk.common.dragHandle" aria-hidden="true">⠿</span>
        <div class="sortable__content">
          <slot
            :item="element"
            :index="index"
            :move="(delta: -1 | 1) => move(index, delta)"
            :first="index === 0"
            :last="index === items.length - 1"
          />
        </div>
        <span v-if="!slotArrows" class="sortable__arrows">
          <button
            type="button"
            class="sortable__arrow"
            :aria-label="sk.common.moveUp"
            :disabled="disabled || index === 0"
            @click="move(index, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            class="sortable__arrow"
            :aria-label="sk.common.moveDown"
            :disabled="disabled || index === items.length - 1"
            @click="move(index, 1)"
          >
            ↓
          </button>
        </span>
      </li>
    </template>
  </Draggable>
</template>

<style scoped>
.sortable {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.sortable__item {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  background: var(--surface);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  padding: var(--s-1) var(--s-2);
  transition:
    box-shadow var(--t-fast) var(--ease),
    transform var(--t-fast) var(--ease);
}

.sortable--dense .sortable__item {
  border: 0;
  background: transparent;
  padding: 0;
}

.sortable__handle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: var(--s-5);
  min-height: var(--btn-h);
  color: var(--text-muted);
  cursor: grab;
  user-select: none;
  touch-action: none;
}

.sortable__content {
  flex: 1;
  min-width: 0;
}

.sortable__arrows {
  display: inline-flex;
  gap: var(--s-1);
}

.sortable__arrow {
  min-width: var(--s-6);
  min-height: var(--s-6);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.sortable__arrow:hover:not(:disabled) {
  background: var(--surface-2);
  color: var(--text);
}

.sortable__arrow:disabled {
  opacity: var(--opacity-muted);
  cursor: default;
}

.sortable--large .sortable__handle,
.sortable--large .sortable__arrow {
  min-width: var(--tap-min);
  min-height: var(--tap-min);
}

/* `--fit`: text fit step of the parent (choiceLayout.ts), 1 when not set */
.sortable--large .sortable__item {
  font-size: max(var(--fs-player-min), calc(var(--fs-player-option) * var(--fit, 1)));
  font-weight: var(--fw-semibold);
}

.sortable__ghost {
  opacity: var(--opacity-disabled);
}

.sortable__chosen,
.sortable__drag {
  box-shadow: var(--shadow-lg);
  transform: scale(calc(1 + 0.02 * var(--motion)));
}
</style>
