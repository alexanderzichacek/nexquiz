<script setup lang="ts">
import { formatPin } from "@nexquiz/shared";
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";

/** White card (always, for scanner readability) with the QR code and a short URL under it. */
const props = defineProps<{ pin: string; shortUrl: string }>();

const src = computed(() => `/api/games/${encodeURIComponent(props.pin)}/qr`);
</script>

<template>
  <figure class="qr">
    <img class="qr__img" :src="src" :alt="format(sk.game.qrAlt, { pin: formatPin(pin) })" />
    <figcaption class="qr__url">{{ shortUrl }}</figcaption>
  </figure>
</template>

<style scoped>
.qr {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  margin: 0;
  padding: var(--s-4);
  border-radius: var(--radius-lg);
  background: var(--qr-bg);
  color: var(--qr-text);
  box-shadow: var(--shadow-lg);
}

.qr__img {
  display: block;
  height: var(--qr-size);
  min-height: var(--qr-min);
  aspect-ratio: 1;
  image-rendering: pixelated;
}

.qr__url {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
}
</style>
