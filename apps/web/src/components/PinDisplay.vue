<script setup lang="ts">
import { formatPin } from "@nexquiz/shared";
import { ref } from "vue";
import { sk } from "@/i18n/sk";

/** PIN split as `123 456`; optionally copies itself to the clipboard on click. */
const props = withDefaults(defineProps<{ pin: string; copyable?: boolean }>(), { copyable: false });

const copied = ref(false);

async function copy(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.pin);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1500);
  } catch {
    // Clipboard is unavailable outside secure contexts; the PIN stays visible.
  }
}
</script>

<template>
  <button v-if="copyable" type="button" class="pin pin--copy tabular" :title="sk.common.copyPin" @click="copy">
    {{ formatPin(pin) }}
    <span class="pin__copied" aria-live="polite">{{ copied ? sk.common.copied : "" }}</span>
  </button>
  <span v-else class="pin tabular">{{ formatPin(pin) }}</span>
</template>

<style scoped>
.pin {
  font-family: var(--font-mono);
  font-weight: var(--fw-black);
  letter-spacing: 0.08em;
  white-space: nowrap;
}

.pin--copy {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: var(--tap-min);
  padding: 0 var(--s-2);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: copy;
}

.pin--copy:hover {
  background: var(--surface-2);
}

.pin__copied {
  font-family: var(--font);
  font-size: var(--fs-small);
  font-weight: var(--fw-regular);
  letter-spacing: normal;
  color: var(--success);
}
</style>
