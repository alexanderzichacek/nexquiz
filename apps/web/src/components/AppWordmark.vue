<script setup lang="ts">
import { sk } from "@/i18n/sk";

withDefaults(defineProps<{ small?: boolean }>(), { small: false });
</script>

<template>
  <span class="wordmark" :class="{ 'wordmark--small': small }" :aria-label="sk.brand.name">
    <span class="wordmark__nex" aria-hidden="true">{{ sk.brand.nex }}</span>
    <span class="wordmark__quiz" aria-hidden="true">{{ sk.brand.quiz }}</span>
  </span>
</template>

<style scoped>
.wordmark {
  font-family: var(--font);
  font-size: var(--fs-wordmark);
  font-weight: var(--fw-black);
  letter-spacing: -0.02em;
  line-height: 1;
  white-space: nowrap;
}

.wordmark--small {
  font-size: var(--fs-body);
}

.wordmark__nex {
  color: var(--text);
}

.wordmark__quiz {
  color: var(--primary);
}
</style>
