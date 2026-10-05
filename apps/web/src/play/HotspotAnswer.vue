<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import { sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { fromUnitPoint, toClampedUnitPoint, toUnitPoint, type UnitPoint } from "@/lib/imageFit";
import { useContainedImage } from "@/lib/useContainedImage";
import SubmitBar from "./SubmitBar.vue";

/**
 * `hotspot`: a tap places a 28 px marker that can be dragged before
 * „Odoslať“. Coordinates are normalized (0–1) to the DISPLAYED image under
 * `object-fit: contain` (taps in the letterbox are ignored).
 */
const props = defineProps<{ imageId: string; locked: boolean }>();
const emit = defineEmits<{ submit: [point: UnitPoint] }>();

/** Keyboard step of the marker (arrow keys), in normalized units. */
const KEY_STEP = 0.01;

const img = useTemplateRef<HTMLImageElement>("img");
const { rect } = useContainedImage(img);
const point = ref<UnitPoint | null>(null);
let dragging = false;

const marker = computed(() => (point.value ? fromUnitPoint(rect.value, point.value) : null));

function local(event: PointerEvent): { x: number; y: number } | null {
  const el = img.value;
  if (!el) return null;
  const box = el.getBoundingClientRect();
  return { x: event.clientX - box.left, y: event.clientY - box.top };
}

/** A tap (on the image or the marker) places the marker and starts dragging it. */
function onPointerDown(event: PointerEvent): void {
  if (props.locked) return;
  const p = local(event);
  if (!p) return;
  const unit = toUnitPoint(rect.value, p.x, p.y);
  if (!unit) return;
  point.value = unit;
  dragging = true;
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  event.preventDefault();
}

function onPointerMove(event: PointerEvent): void {
  if (!dragging || props.locked) return;
  const p = local(event);
  if (p) point.value = toClampedUnitPoint(rect.value, p.x, p.y);
}

function onPointerUp(event: PointerEvent): void {
  dragging = false;
  const el = event.currentTarget as HTMLElement;
  if (el.hasPointerCapture(event.pointerId)) el.releasePointerCapture(event.pointerId);
}

function onMarkerKey(event: KeyboardEvent): void {
  if (props.locked || !point.value) return;
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-KEY_STEP, 0],
    ArrowRight: [KEY_STEP, 0],
    ArrowUp: [0, -KEY_STEP],
    ArrowDown: [0, KEY_STEP],
  };
  const d = delta[event.key];
  if (!d) return;
  event.preventDefault();
  const clamp = (v: number): number => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000;
  point.value = { x: clamp(point.value.x + d[0]), y: clamp(point.value.y + d[1]) };
}

function submit(): void {
  if (point.value && !props.locked) emit("submit", point.value);
}
</script>

<template>
  <p class="hotspot__hint">{{ sk.play.hotspotHint }}</p>
  <div
    class="hotspot"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @pointercancel="onPointerUp"
  >
    <img ref="img" :src="mediaUrl(imageId)" :alt="sk.play.hotspotImage" class="hotspot__img" draggable="false" />
    <button
      v-if="marker"
      type="button"
      class="hotspot__marker"
      :aria-label="sk.play.hotspotMarker"
      :style="{ left: `${marker.left}px`, top: `${marker.top}px` }"
      :disabled="locked"
      @keydown="onMarkerKey"
    ></button>
  </div>
  <SubmitBar :disabled="locked || !point" @submit="submit" />
</template>

<style scoped>
.hotspot__hint {
  color: var(--text-muted);
  font-size: var(--fs-small);
}

.hotspot {
  position: relative;
  width: 100%;
  touch-action: none;
}

.hotspot__img {
  display: block;
  width: 100%;
  height: var(--h-hotspot-max);
  object-fit: contain;
  border-radius: var(--radius-sm);
  user-select: none;
  -webkit-user-select: none;
  -webkit-touch-callout: none;
}

.hotspot__marker {
  position: absolute;
  width: var(--tap-min);
  height: var(--tap-min);
  padding: 0;
  transform: translate(-50%, -50%);
  border: 0;
  background: transparent;
  cursor: grab;
  touch-action: none;
}

/* visible 28 px target with a white border inside a 48 px touch area */
.hotspot__marker::after {
  content: "";
  position: absolute;
  left: 50%;
  top: 50%;
  width: var(--marker);
  height: var(--marker);
  transform: translate(-50%, -50%);
  border: var(--ring-selected) solid var(--marker-border);
  border-radius: 50%;
  background: radial-gradient(circle, var(--danger) 0 25%, var(--primary) 26% 100%);
  box-shadow: var(--shadow-lg);
}

.hotspot__marker:disabled {
  cursor: default;
}
</style>
