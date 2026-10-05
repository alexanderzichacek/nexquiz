<script setup lang="ts">
/** Inline validation message under a field (`--danger`). */
defineProps<{ message?: string | undefined; id?: string }>();
</script>

<template>
  <p v-if="message" :id="id" class="field-error">{{ message }}</p>
</template>

<style scoped>
.field-error {
  color: var(--danger);
  font-size: var(--fs-editor-label);
  margin-top: var(--s-1);
}
</style>
