<script setup lang="ts">
import { sk } from "@/i18n/sk";
import { usePlayerMedia } from "./usePlayerMedia";

/**
 * „🔊 Zvuk a video na tomto zariadení“ – off by default. Switching it on is
 * a tap, so it also unlocks audio in the browser (autoplay policy).
 */
defineProps<{ hint?: boolean }>();

const media = usePlayerMedia();

function onChange(event: Event): void {
  media.setEnabled((event.target as HTMLInputElement).checked);
}
</script>

<template>
  <label class="media-toggle">
    <input
      type="checkbox"
      role="switch"
      class="media-toggle__switch"
      :checked="media.enabled.value"
      :aria-describedby="hint ? 'media-toggle-hint' : undefined"
      @change="onChange"
    />
    <span class="media-toggle__text">
      <span class="media-toggle__label">{{ sk.play.media }}</span>
      <span v-if="hint" id="media-toggle-hint" class="media-toggle__hint">{{ sk.play.mediaHint }}</span>
    </span>
  </label>
</template>

<style scoped>
.media-toggle {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: var(--tap-min);
  cursor: pointer;
}

.media-toggle__switch {
  position: relative;
  flex: none;
  width: calc(var(--icon-lg) * 1.8);
  height: var(--icon-lg);
  margin: 0;
  border: var(--border-w) solid var(--border);
  border-radius: var(--icon-lg);
  background: var(--surface-2);
  appearance: none;
  cursor: pointer;
  transition: background var(--t-fast) var(--ease);
}

.media-toggle__switch::before {
  content: "";
  position: absolute;
  top: var(--s-1);
  left: var(--s-1);
  width: calc(var(--icon-lg) - 2 * var(--s-1) - 2 * var(--border-w));
  height: calc(var(--icon-lg) - 2 * var(--s-1) - 2 * var(--border-w));
  border-radius: 50%;
  background: var(--text-muted);
  transition: transform var(--t-fast) var(--ease);
}

.media-toggle__switch:checked {
  border-color: var(--primary);
  background: var(--primary);
}

.media-toggle__switch:checked::before {
  background: var(--primary-contrast);
  transform: translateX(calc(var(--icon-lg) * 0.8));
}

.media-toggle__switch:focus-visible {
  outline: var(--focus-ring) solid var(--primary);
  outline-offset: var(--focus-ring);
}

.media-toggle__text {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.media-toggle__label {
  font-weight: var(--fw-semibold);
}

.media-toggle__hint {
  color: var(--text-muted);
  font-size: var(--fs-small);
}
</style>
