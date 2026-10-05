<script setup lang="ts">
import { LIMITS, type Option, type OrderQuestion } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import SortableList from "@/components/SortableList.vue";
import { format, sk } from "@/i18n/sk";
import { localId } from "@/lib/ids";
import FieldError from "./FieldError.vue";
import type { ErrorMap } from "./validation";

/** Items of an `order` question in the CORRECT order (drag & drop, 3–8). */
const question = defineModel<OrderQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();

const items = computed<Option[]>({
  get: () => question.value.data.items,
  set: (value) => {
    question.value.data.items = value;
  },
});
const canAdd = computed(() => items.value.length < LIMITS.orderItems.max);
const canRemove = computed(() => items.value.length > LIMITS.orderItems.min);

function addItem(): void {
  if (canAdd.value) question.value.data.items.push({ id: localId(), text: "" });
}

function removeItem(id: string): void {
  if (canRemove.value) question.value.data.items = question.value.data.items.filter((i) => i.id !== id);
}
</script>

<template>
  <fieldset class="order">
    <legend class="label">{{ sk.editor.items }}</legend>
    <SortableList v-model="items">
      <template #default="{ item, index }">
        <div class="order__row">
          <span class="order__num tabular" aria-hidden="true">{{ index + 1 }}.</span>
          <div class="order__field">
            <input
              v-model="item.text"
              class="input"
              :class="{ 'input--error': errors[`data.items.${index}.text`] }"
              :maxlength="LIMITS.optionText.max"
              :placeholder="format(sk.editor.itemPlaceholder, { n: index + 1 })"
              :aria-label="format(sk.editor.itemPlaceholder, { n: index + 1 })"
            />
            <FieldError :message="errors[`data.items.${index}.text`]" />
          </div>
          <button
            type="button"
            class="icon-btn"
            :disabled="!canRemove"
            :aria-label="format(sk.editor.removeItem, { n: index + 1 })"
            @click="removeItem(item.id)"
          >
            ×
          </button>
        </div>
      </template>
    </SortableList>
    <FieldError :message="errors['data.items']" />
    <div class="order__foot">
      <BaseButton v-if="canAdd" variant="ghost" @click="addItem">{{ sk.editor.addItem }}</BaseButton>
      <p class="hint">{{ sk.editor.shuffledNote }}</p>
    </div>
  </fieldset>
</template>

<style scoped>
.order {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  border: 0;
}

.order__row {
  display: flex;
  align-items: flex-start;
  gap: var(--s-2);
}

.order__num {
  min-width: var(--s-5);
  line-height: var(--btn-h);
  color: var(--text-muted);
  font-weight: var(--fw-semibold);
}

.order__field {
  flex: 1;
  min-width: 0;
}

.order__foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
}
</style>
