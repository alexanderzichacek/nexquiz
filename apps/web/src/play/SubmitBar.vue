<script setup lang="ts">
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { useKeyboardInset } from "@/lib/useKeyboardInset";

/**
 * Sticky „Odoslať“ at the bottom of the player screen (thumb zone). It is
 * lifted by the on-screen keyboard height, so the keyboard never covers it.
 */
withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false });
defineEmits<{ submit: [] }>();

const inset = useKeyboardInset();
</script>

<template>
  <div class="submit-bar" :style="{ '--kb-inset': `${inset}px` }">
    <BaseButton variant="primary" block large :disabled="disabled" @click="$emit('submit')">
      {{ sk.play.submit }}
    </BaseButton>
  </div>
</template>

<style scoped>
.submit-bar {
  position: sticky;
  bottom: var(--kb-inset);
  z-index: 5;
  margin-top: auto;
  padding: var(--s-3) 0 max(var(--s-1), env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--play-bg) 70%, transparent);
}
</style>
