<script setup lang="ts">
import type { Option } from "@nexquiz/shared";
import { computed, ref } from "vue";
import { playerOrderFit } from "@/components/choiceLayout";
import SortableList from "@/components/SortableList.vue";
import { sk } from "@/i18n/sk";
import SubmitBar from "./SubmitBar.vue";

/**
 * `order`: drag & drop via ⠿ plus ↑↓ buttons, then „Odoslať“ with the ids in
 * the chosen order. Long lists scroll inside their own box; „Odoslať“ stays visible.
 */
const props = defineProps<{ items: readonly Option[]; locked: boolean }>();
const emit = defineEmits<{ submit: [order: string[]] }>();

const list = ref<Option[]>([...props.items]);
const fit = computed(() => playerOrderFit(props.items));
</script>

<template>
  <div class="order-answer">
    <p class="order__hint">{{ sk.play.orderHint }}</p>
    <div class="order__list" :class="`fit-${fit}`">
      <SortableList v-model="list" :disabled="locked" large>
        <template #default="{ item }">
          <span class="order__text">{{ item.text }}</span>
        </template>
      </SortableList>
    </div>
    <SubmitBar :disabled="locked" @submit="emit('submit', list.map((i) => i.id))" />
  </div>
</template>

<style scoped>
.order-answer {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  flex: 1;
  min-height: 0;
}

.order__hint {
  flex: none;
  color: var(--text-muted);
  font-size: var(--fs-small);
}

/* the only box on the player screen that may scroll (many long items) */
.order__list {
  flex: 0 1 auto;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.order__text {
  display: block;
  padding: var(--s-1) 0;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
</style>
