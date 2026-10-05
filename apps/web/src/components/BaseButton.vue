<script setup lang="ts">
export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

withDefaults(
  defineProps<{
    variant?: ButtonVariant;
    type?: "button" | "submit" | "reset";
    loading?: boolean;
    disabled?: boolean;
    block?: boolean;
    /** Player size: min. 52 px height. */
    large?: boolean;
  }>(),
  { variant: "primary", type: "button", loading: false, disabled: false, block: false, large: false },
);
</script>

<template>
  <button
    :type="type"
    class="btn"
    :class="[`btn--${variant}`, { 'btn--block': block, 'btn--large': large, 'btn--loading': loading }]"
    :disabled="disabled || loading"
    :aria-busy="loading || undefined"
  >
    <span v-if="loading" class="btn__spinner" aria-hidden="true" />
    <span class="btn__label"><slot /></span>
  </button>
</template>

<style scoped>
.btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  min-height: var(--btn-h);
  min-width: var(--tap-min);
  padding: 0 var(--s-5);
  border: var(--border-w) solid transparent;
  border-radius: var(--radius);
  font-weight: var(--fw-semibold);
  cursor: pointer;
  transition:
    background-color var(--t-fast) var(--ease),
    opacity var(--t-fast) var(--ease);
}

.btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.btn--block {
  display: flex;
  width: 100%;
}

.btn--large {
  min-height: var(--btn-h-player);
}

.btn--primary {
  background: var(--primary);
  color: var(--primary-contrast);
}

.btn--secondary {
  background: var(--surface-2);
  color: var(--text);
  border-color: var(--border);
}

.btn--ghost {
  background: transparent;
  color: var(--text);
}

.btn--ghost:hover:not(:disabled) {
  background: var(--surface-2);
}

.btn--danger {
  background: var(--danger);
  color: var(--primary-contrast);
}

.btn--loading .btn__label {
  opacity: 0.7;
}

.btn__spinner {
  width: var(--s-4);
  height: var(--s-4);
  border: var(--focus-ring) solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: btn-spin calc(var(--t-slow) * 2) linear infinite;
}

@keyframes btn-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
