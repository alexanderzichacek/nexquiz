<script setup lang="ts">
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";

/**
 * „Odoslať“ at the bottom of the player screen (thumb zone). The question
 * screen never scrolls and PlayPage shrinks it by the on-screen keyboard
 * height (`useKeyboardInset`), so the bar is always visible above the keyboard.
 */
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
defineEmits<{ submit: [] }>();
</script>

<template>
  <div class="submit-bar">
    <BaseButton variant="primary" block large :disabled="disabled" @click="$emit('submit')">
      {{ sk.play.submit }}
    </BaseButton>
  </div>
</template>

<style scoped>
.submit-bar {
  flex: none;
  margin-top: auto;
  padding-top: var(--s-2);
}
</style>
