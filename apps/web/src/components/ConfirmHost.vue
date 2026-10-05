<script setup lang="ts">
import { computed } from "vue";
import { useConfirmStore } from "@/stores/confirm";
import BaseButton from "./BaseButton.vue";
import BaseDialog from "./BaseDialog.vue";

const confirm = useConfirmStore();

const open = computed({
  get: () => confirm.pending !== null,
  set: (value: boolean) => {
    if (!value && confirm.pending) confirm.answer(false);
  },
});
</script>

<template>
  <BaseDialog v-if="confirm.pending" v-model:open="open" :title="confirm.pending.title">
    <p>{{ confirm.pending.message }}</p>
    <template #actions>
      <BaseButton variant="ghost" @click="confirm.answer(false)">{{ confirm.pending.cancelLabel }}</BaseButton>
      <BaseButton :variant="confirm.pending.danger ? 'danger' : 'primary'" @click="confirm.answer(true)">
        {{ confirm.pending.confirmLabel }}
      </BaseButton>
    </template>
  </BaseDialog>
</template>
