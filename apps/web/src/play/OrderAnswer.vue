<script setup lang="ts">
import type { Option } from "@nexquiz/shared";
import { ref } from "vue";
import SortableList from "@/components/SortableList.vue";
import { sk } from "@/i18n/sk";
import SubmitBar from "./SubmitBar.vue";

/** `order`: drag & drop via ⠿ plus ↑↓ buttons, then „Odoslať“ with the ids in the chosen order. */
const props = defineProps<{ items: readonly Option[]; locked: boolean }>();
const emit = defineEmits<{ submit: [order: string[]] }>();

const list = ref<Option[]>([...props.items]);
</script>

<template>
  <p class="order__hint">{{ sk.play.orderHint }}</p>
  <SortableList v-model="list" :disabled="locked" large>
    <template #default="{ item }">
      <span class="order__text">{{ item.text }}</span>
    </template>
  </SortableList>
  <SubmitBar :disabled="locked" @submit="emit('submit', list.map((i) => i.id))" />
</template>

<style scoped>
.order__hint {
  color: var(--text-muted);
  font-size: var(--fs-small);
}

.order__text {
  display: block;
  padding: var(--s-2) 0;
  overflow-wrap: anywhere;
}
</style>
