<script setup lang="ts">
import type { HotspotTarget } from "@nexquiz/shared";
import { computed, useTemplateRef } from "vue";
import { sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { fromUnitPoint, type UnitPoint } from "@/lib/imageFit";
import { useContainedImage } from "@/lib/useContainedImage";

/**
 * Player hotspot result: the correct areas as green circles and the own tap
 * as the same marker as when answering (shape and color, plus the legend).
 * The image box shrinks with the free height of the result screen.
 */
const props = defineProps<{ imageId: string; targets: readonly HotspotTarget[]; tap: UnitPoint | null }>();

const img = useTemplateRef<HTMLImageElement>("img");
const { rect } = useContainedImage(img);

const circles = computed(() =>
  props.targets.map((t, i) => {
    const center = fromUnitPoint(rect.value, t);
    // `r` is a fraction of the image WIDTH (a circle also on non-square images).
    return { key: i, left: center.left, top: center.top, size: 2 * t.r * rect.value.width };
  }),
);
const marker = computed(() => (props.tap ? fromUnitPoint(rect.value, props.tap) : null));
</script>

<template>
  <figure class="hs-result">
    <div class="hs-result__box">
      <img ref="img" :src="mediaUrl(imageId)" :alt="sk.play.hotspotResultImage" class="hs-result__img" />
      <template v-if="rect.width > 0">
        <span
          v-for="c in circles"
          :key="c.key"
          class="hs-result__target"
          :style="{ left: `${c.left}px`, top: `${c.top}px`, width: `${c.size}px`, height: `${c.size}px` }"
          aria-hidden="true"
        ></span>
        <span
          v-if="marker"
          class="hs-result__marker"
          :style="{ left: `${marker.left}px`, top: `${marker.top}px` }"
          aria-hidden="true"
        ></span>
      </template>
    </div>
    <figcaption class="hs-result__legend">
      <span class="hs-result__key"><span class="hs-result__swatch hs-result__swatch--target"></span>{{ sk.play.hotspotCorrect }}</span>
      <span v-if="tap" class="hs-result__key"><span class="hs-result__swatch hs-result__swatch--tap"></span>{{ sk.play.hotspotYourTap }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.hs-result {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  flex: 0 1 auto;
  width: 100%;
  min-height: 0;
  margin: 0;
  padding: var(--s-2);
  border-radius: var(--radius);
  background: var(--overlay);
}

.hs-result__box {
  position: relative;
  flex: 0 1 var(--h-player-image);
  width: 100%;
  min-height: var(--s-8);
}

.hs-result__img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

.hs-result__target {
  position: absolute;
  transform: translate(-50%, -50%);
  border: var(--ring-selected) solid var(--success);
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 35%, transparent);
  box-shadow: 0 0 0 var(--border-w) var(--marker-border);
}

/* same look as the answering marker (HotspotAnswer) */
.hs-result__marker {
  position: absolute;
  width: var(--marker);
  height: var(--marker);
  transform: translate(-50%, -50%);
  border: var(--ring-selected) solid var(--marker-border);
  border-radius: 50%;
  background: radial-gradient(circle, var(--danger) 0 25%, var(--primary) 26% 100%);
  box-shadow: var(--shadow-lg);
}

.hs-result__legend {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-4);
  font-size: var(--fs-small);
  font-weight: var(--fw-semibold);
}

.hs-result__key {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
}

.hs-result__swatch {
  display: inline-block;
  width: var(--s-4);
  height: var(--s-4);
  border-radius: 50%;
  border: var(--focus-ring) solid var(--marker-border);
}

.hs-result__swatch--target {
  background: var(--success);
}

.hs-result__swatch--tap {
  background: radial-gradient(circle, var(--danger) 0 25%, var(--primary) 26% 100%);
}
</style>
