<script setup lang="ts">
import { sk } from "@/i18n/sk";

/** Small corner indicator while the connection is lost: „Pripájam sa znova…“. */
defineProps<{ visible: boolean }>();
</script>

<template>
  <Transition name="badge">
    <div v-if="visible" class="badge" role="status">
      <span class="badge__dot" aria-hidden="true"></span>
      {{ sk.errors.reconnecting }}
    </div>
  </Transition>
</template>

<style scoped>
.badge {
  position: fixed;
  top: max(var(--s-2), env(safe-area-inset-top));
  right: max(var(--s-2), env(safe-area-inset-right));
  z-index: 60;
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-1) var(--s-3);
  border-radius: 999px;
  background: var(--warning);
  color: var(--qr-text);
  font-size: var(--fs-small);
  font-weight: var(--fw-semibold);
  box-shadow: var(--shadow);
}

.badge__dot {
  width: var(--s-2);
  height: var(--s-2);
  border-radius: 50%;
  background: currentColor;
  animation: blink 1s var(--ease) infinite;
}

@keyframes blink {
  50% {
    opacity: 0.3;
  }
}

@media (prefers-reduced-motion: reduce) {
  .badge__dot {
    animation: none;
  }
}

.badge-enter-active,
.badge-leave-active {
  transition: opacity var(--t) var(--ease);
}

.badge-enter-from,
.badge-leave-to {
  opacity: 0;
}
</style>
