<script setup lang="ts">
import type { HotspotTap, HotspotTarget } from "@nexquiz/shared";
import { computed, useTemplateRef } from "vue";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { fromUnitPoint } from "@/lib/imageFit";
import { useContainedImage } from "@/lib/useContainedImage";

/**
 * Hotspot reveal: targets as translucent green circles, players' taps as
 * 10 px dots – filled green for a hit, a red ring for a miss (shape and
 * color, plus the legend text).
 */
const props = defineProps<{ imageId: string; targets: readonly HotspotTarget[]; taps: readonly HotspotTap[] }>();

const img = useTemplateRef<HTMLImageElement>("img");
const { rect } = useContainedImage(img);

const circles = computed(() =>
  props.targets.map((t, i) => {
    const center = fromUnitPoint(rect.value, t);
    // `r` is a fraction of the image WIDTH (a circle also on non-square images).
    const diameter = 2 * t.r * rect.value.width;
    return { key: i, left: center.left, top: center.top, size: diameter };
  }),
);
const dots = computed(() => props.taps.map((tap, i) => ({ key: i, hit: tap.hit, ...fromUnitPoint(rect.value, tap) })));
const hits = computed(() => props.taps.filter((t) => t.hit).length);
</script>

<template>
  <figure class="heatmap">
    <div class="heatmap__box">
      <img ref="img" :src="mediaUrl(imageId)" alt="" class="heatmap__img" />
      <template v-if="rect.width > 0">
        <span
          v-for="c in circles"
          :key="`t${c.key}`"
          class="heatmap__target"
          :style="{ left: `${c.left}px`, top: `${c.top}px`, width: `${c.size}px`, height: `${c.size}px` }"
          aria-hidden="true"
        ></span>
        <span
          v-for="d in dots"
          :key="`d${d.key}`"
          class="heatmap__dot"
          :class="d.hit ? 'heatmap__dot--hit' : 'heatmap__dot--miss'"
          :style="{ left: `${d.left}px`, top: `${d.top}px` }"
          aria-hidden="true"
        ></span>
      </template>
    </div>
    <figcaption class="heatmap__legend">
      <span>{{ format(sk.game.tapsSummary, { hits, count: taps.length }) }}</span>
      <span class="heatmap__key"><span class="heatmap__dot heatmap__dot--hit heatmap__dot--static"></span>{{ sk.game.legendHit }}</span>
      <span class="heatmap__key"><span class="heatmap__dot heatmap__dot--miss heatmap__dot--static"></span>{{ sk.game.legendMiss }}</span>
    </figcaption>
  </figure>
</template>

<style scoped>
.heatmap {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  flex: 1;
  min-height: 0;
  margin: 0;
}

.heatmap__box {
  position: relative;
  width: 100%;
  flex: 1;
  min-height: 0;
}

/* the image fills the free height of the stage (no fixed height → no page scroll) */
.heatmap__img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.heatmap__target {
  position: absolute;
  transform: translate(-50%, -50%);
  border: var(--focus-ring) solid var(--success);
  border-radius: 50%;
  background: color-mix(in srgb, var(--success) 35%, transparent);
}

.heatmap__dot {
  position: absolute;
  width: var(--heat-dot);
  height: var(--heat-dot);
  transform: translate(-50%, -50%);
  border-radius: 50%;
}

.heatmap__dot--hit {
  background: var(--success);
  box-shadow: 0 0 0 var(--border-w) var(--marker-border);
}

.heatmap__dot--miss {
  background: transparent;
  border: calc(var(--heat-dot) / 3) solid var(--danger);
}

.heatmap__dot--static {
  position: static;
  display: inline-block;
  transform: none;
  margin-right: var(--s-2);
}

.heatmap__legend {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--s-5);
  flex: none;
  font-size: var(--fs-host-body);
}

.heatmap__key {
  display: inline-flex;
  align-items: center;
  color: var(--text-muted);
}
</style>
