<script setup lang="ts">
import { sk } from "@/i18n/sk";
import { useToastStore } from "@/stores/toast";

const toast = useToastStore();
</script>

<template>
  <div class="toasts" aria-live="polite" aria-atomic="false">
    <TransitionGroup name="toast">
      <div
        v-for="t in toast.toasts"
        :key="t.id"
        class="toast"
        :class="`toast--${t.kind}`"
        :role="t.kind === 'error' ? 'alert' : 'status'"
      >
        <span class="toast__icon" aria-hidden="true">{{ t.kind === "error" ? "✗" : t.kind === "success" ? "✓" : "ℹ" }}</span>
        <span class="toast__message">{{ t.message }}</span>
        <button type="button" class="toast__close" :aria-label="sk.common.close" @click="toast.dismiss(t.id)">×</button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  left: 50%;
  bottom: max(var(--s-5), env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  width: min(calc(100% - 2 * var(--s-4)), var(--w-player));
  pointer-events: none;
}

.toast {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  border-radius: var(--radius);
  background: var(--text);
  color: var(--bg);
  box-shadow: var(--shadow-lg);
  pointer-events: auto;
}

.toast--error .toast__icon {
  color: var(--danger);
}

.toast--success .toast__icon {
  color: var(--success);
}

.toast__icon {
  font-weight: var(--fw-black);
}

.toast__message {
  flex: 1;
}

.toast__close {
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  margin: calc(-1 * var(--s-3)) calc(-1 * var(--s-4)) calc(-1 * var(--s-3)) 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-size: var(--fs-claim);
  cursor: pointer;
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity var(--t) var(--ease),
    transform var(--t) var(--ease);
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(calc(var(--s-4) * var(--motion)));
}
</style>
