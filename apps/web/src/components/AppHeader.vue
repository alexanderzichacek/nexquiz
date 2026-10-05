<script setup lang="ts">
import { RouterLink } from "vue-router";
import AppWordmark from "./AppWordmark.vue";

/** `homeTo` is where the wordmark links (`/` on landing, `/host` in host admin). */
withDefaults(defineProps<{ homeTo?: string }>(), { homeTo: "/" });
</script>

<template>
  <header class="app-header">
    <RouterLink :to="homeTo" class="app-header__home">
      <AppWordmark />
    </RouterLink>
    <div class="app-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  padding: var(--s-4) var(--s-5);
  padding-top: max(var(--s-4), env(safe-area-inset-top));
}

.app-header__home {
  text-decoration: none;
  border-radius: var(--radius-sm);
}

.app-header__actions {
  display: flex;
  align-items: center;
  gap: var(--s-2);
}
</style>
