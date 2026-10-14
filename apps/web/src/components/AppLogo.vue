<script setup lang="ts">
import { sk } from "@/i18n/sk";
import AppWordmark from "./AppWordmark.vue";
</script>

<template>
  <span class="logo" role="img" :aria-label="sk.brand.name">
    <svg class="logo__mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="14" class="logo__bg" />
      <path d="M19 47V17h6.2l13.6 19.4V17H45v30h-6.1L25.2 27.6V47z" class="logo__n" />
    </svg>
    <AppWordmark class="logo__word" aria-hidden="true" />
  </span>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: var(--s-3);
}

.logo__mark {
  width: var(--logo-mark);
  height: var(--logo-mark);
  flex: none;
}

.logo__bg {
  fill: var(--primary);
}

.logo__n {
  fill: var(--primary-contrast);
}

.logo__word {
  font-size: var(--fs-logo);
}
</style>
