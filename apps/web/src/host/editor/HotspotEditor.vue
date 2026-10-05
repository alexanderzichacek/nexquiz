<script setup lang="ts">
import { LIMITS, type HotspotQuestion, type MediaUploadResponse } from "@nexquiz/shared";
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from "vue";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import FieldError from "./FieldError.vue";
import {
  clamp,
  DEFAULT_RADIUS,
  KEY_STEP,
  KEY_STEP_LARGE,
  MAX_RADIUS,
  MIN_RADIUS,
  radiusThrough,
  round4,
  toImagePoint,
  type Point,
} from "./hotspotGeometry";
import MediaUpload from "./MediaUpload.vue";
import type { ErrorMap } from "./validation";

/**
 * `hotspot` question: image upload + circle targets. Click adds a circle,
 * dragging moves it, the handle changes the radius, Delete removes it.
 */
const question = defineModel<HotspotQuestion>({ required: true });
defineProps<{ errors: ErrorMap }>();

/** Radius of the resize handle in screen pixels. */
const HANDLE_PX = 9;
/** Font size of the target number in screen pixels. */
const LABEL_PX = 16;

const svgEl = useTemplateRef<SVGSVGElement>("svgEl");
const natural = ref<{ w: number; h: number } | null>(null);
const scale = ref(1);
const selected = ref<number | null>(null);
let drag: { mode: "move" | "resize"; index: number; offset: Point } | null = null;
let observer: ResizeObserver | null = null;

const imageId = computed(() => question.value.media?.imageId);
const imageSrc = computed(() => (imageId.value ? mediaUrl(imageId.value) : undefined));
const targets = computed(() => question.value.data.targets);
const aspect = computed(() => (natural.value ? natural.value.h / natural.value.w : 1));
const canAdd = computed(() => targets.value.length < LIMITS.hotspotTargets.max);

watch(imageId, () => {
  natural.value = null;
  selected.value = null;
});

watch(
  () => question.value.id,
  () => {
    selected.value = null;
  },
);

watch(svgEl, (el) => {
  observer?.disconnect();
  if (!el) return;
  observer = new ResizeObserver(updateScale);
  observer.observe(el);
  updateScale();
});

function updateScale(): void {
  const el = svgEl.value;
  if (!el || !natural.value) return;
  const width = el.getBoundingClientRect().width;
  if (width > 0) scale.value = natural.value.w / width;
}

function onImageLoad(event: Event): void {
  const img = event.target as HTMLImageElement;
  natural.value = { w: img.naturalWidth || 1, h: img.naturalHeight || 1 };
  updateScale();
}

function onUploaded(media: MediaUploadResponse): void {
  question.value.media = { ...question.value.media, imageId: media.id };
}

function removeImage(): void {
  const media = { ...question.value.media };
  delete media.imageId;
  question.value.media = media.audioId ? media : undefined;
}

function pointOf(event: PointerEvent): Point {
  const el = svgEl.value;
  if (!el) return { x: 0, y: 0 };
  return toImagePoint(el.getBoundingClientRect(), event.clientX, event.clientY);
}

function focusTarget(index: number): void {
  selected.value = index;
  // Focus after render so keyboard shortcuts (Delete, arrows) work right away.
  requestAnimationFrame(() => svgEl.value?.querySelector<SVGElement>(`[data-target="${index}"]`)?.focus());
}

function addTarget(point: Point): void {
  if (!canAdd.value) return;
  question.value.data.targets.push({ shape: "circle", x: point.x, y: point.y, r: DEFAULT_RADIUS });
  focusTarget(question.value.data.targets.length - 1);
}

function onBackgroundDown(event: PointerEvent): void {
  if (event.button !== 0 || event.target !== event.currentTarget) return;
  addTarget(pointOf(event));
}

function startDrag(mode: "move" | "resize", index: number, event: PointerEvent): void {
  if (event.button !== 0) return;
  const target = targets.value[index];
  if (!target) return;
  event.preventDefault();
  const p = pointOf(event);
  drag = { mode, index, offset: { x: p.x - target.x, y: p.y - target.y } };
  selected.value = index;
  svgEl.value?.setPointerCapture(event.pointerId);
  focusTarget(index);
}

function onPointerMove(event: PointerEvent): void {
  if (!drag) return;
  const target = question.value.data.targets[drag.index];
  if (!target) return;
  const p = pointOf(event);
  if (drag.mode === "move") {
    target.x = round4(clamp(p.x - drag.offset.x, 0, 1));
    target.y = round4(clamp(p.y - drag.offset.y, 0, 1));
  } else {
    target.r = radiusThrough(target, p, aspect.value);
  }
}

function endDrag(event: PointerEvent): void {
  if (!drag) return;
  drag = null;
  if (svgEl.value?.hasPointerCapture(event.pointerId)) svgEl.value.releasePointerCapture(event.pointerId);
}

function removeTarget(index: number): void {
  question.value.data.targets.splice(index, 1);
  const remaining = question.value.data.targets.length;
  if (remaining === 0) {
    selected.value = null;
    svgEl.value?.focus();
  } else {
    focusTarget(Math.min(index, remaining - 1));
  }
}

function onTargetKey(index: number, event: KeyboardEvent): void {
  const target = question.value.data.targets[index];
  if (!target) return;
  const step = event.shiftKey ? KEY_STEP_LARGE : KEY_STEP;
  const handled = (() => {
    switch (event.key) {
      case "Delete":
      case "Backspace":
        removeTarget(index);
        return true;
      case "ArrowLeft":
        target.x = round4(clamp(target.x - step, 0, 1));
        return true;
      case "ArrowRight":
        target.x = round4(clamp(target.x + step, 0, 1));
        return true;
      case "ArrowUp":
        target.y = round4(clamp(target.y - step, 0, 1));
        return true;
      case "ArrowDown":
        target.y = round4(clamp(target.y + step, 0, 1));
        return true;
      case "+":
      case "=":
        target.r = round4(clamp(target.r + step, MIN_RADIUS, MAX_RADIUS));
        return true;
      case "-":
        target.r = round4(clamp(target.r - step, MIN_RADIUS, MAX_RADIUS));
        return true;
      default:
        return false;
    }
  })();
  if (handled) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function onCanvasKey(event: KeyboardEvent): void {
  if (event.target !== event.currentTarget) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    addTarget({ x: 0.5, y: 0.5 });
  }
}

onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <div class="stack">
    <div>
      <span class="label">{{ sk.editor.image }}</span>
      <MediaUpload kind="image" :has-media="!!imageSrc" @uploaded="onUploaded" @remove="removeImage" />
      <FieldError :message="errors['media.imageId']" />
    </div>

    <p class="hint">{{ imageSrc ? sk.editor.hotspotHint : sk.editor.hotspotNeedsImage }}</p>

    <div v-if="imageSrc" class="canvas">
      <img :src="imageSrc" class="canvas__img" alt="" draggable="false" @load="onImageLoad" />
      <svg
        v-if="natural"
        ref="svgEl"
        class="canvas__svg"
        :viewBox="`0 0 ${natural.w} ${natural.h}`"
        tabindex="0"
        role="application"
        :aria-label="sk.editor.hotspotHint"
        @pointerdown="onBackgroundDown"
        @pointermove="onPointerMove"
        @pointerup="endDrag"
        @pointercancel="endDrag"
        @keydown="onCanvasKey"
      >
        <g v-for="(t, i) in targets" :key="i">
          <circle
            class="target"
            :class="{ 'target--selected': selected === i }"
            :data-target="i"
            :cx="t.x * natural.w"
            :cy="t.y * natural.h"
            :r="t.r * natural.w"
            tabindex="0"
            role="button"
            :aria-label="format(sk.editor.targetLabel, { n: i + 1 })"
            @pointerdown.stop="startDrag('move', i, $event)"
            @focus="selected = i"
            @keydown="onTargetKey(i, $event)"
          />
          <text class="target__label" :x="t.x * natural.w" :y="t.y * natural.h" :font-size="LABEL_PX * scale">{{ i + 1 }}</text>
          <circle
            class="handle"
            :cx="(t.x + t.r) * natural.w"
            :cy="t.y * natural.h"
            :r="HANDLE_PX * scale"
            :aria-label="format(sk.editor.radiusHandle, { n: i + 1 })"
            @pointerdown.stop="startDrag('resize', i, $event)"
          />
        </g>
      </svg>
    </div>
    <p v-if="imageSrc" class="hint tabular">{{ format(sk.editor.targetCount, { count: targets.length }) }}</p>
    <FieldError :message="errors['data.targets']" />
  </div>
</template>

<style scoped>
.canvas {
  position: relative;
  align-self: flex-start;
  display: inline-block;
  max-width: 100%;
  line-height: 0;
  border-radius: var(--radius-sm);
  overflow: hidden;
  box-shadow: var(--shadow);
}

.canvas__img {
  display: block;
  max-width: 100%;
  max-height: var(--h-hotspot-max);
  user-select: none;
}

.canvas__svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  touch-action: none;
}

.target {
  fill: color-mix(in srgb, var(--success) 35%, transparent);
  stroke: var(--on-option);
  stroke-width: var(--focus-ring);
  vector-effect: non-scaling-stroke;
  cursor: move;
}

.target--selected,
.target:focus-visible {
  stroke: var(--primary);
  stroke-width: var(--ring-selected);
  outline: none;
}

.target__label {
  fill: var(--on-option);
  font-weight: var(--fw-black);
  text-anchor: middle;
  dominant-baseline: central;
  pointer-events: none;
  paint-order: stroke;
  stroke: var(--text);
  stroke-width: var(--focus-ring);
  vector-effect: non-scaling-stroke;
}

.handle {
  fill: var(--on-option);
  stroke: var(--primary);
  stroke-width: var(--focus-ring);
  vector-effect: non-scaling-stroke;
  cursor: ew-resize;
}
</style>
