<script setup lang="ts">
import { computed } from "vue";
import { OPTION_SHAPES } from "./options";

/** Own simple geometric shapes: ▲ ◆ ● ■ ★ ⬢ (index 0–5). */
const props = defineProps<{ index: number }>();

const shape = computed(() => OPTION_SHAPES[props.index % OPTION_SHAPES.length] ?? "triangle");

function regularPolygon(points: number, outer: number, inner: number | null, rotation: number): string {
  const step = Math.PI / points;
  const coords: string[] = [];
  const total = inner === null ? points : points * 2;
  for (let i = 0; i < total; i++) {
    const radius = inner === null || i % 2 === 0 ? outer : inner;
    const angle = rotation + (inner === null ? 2 * step : step) * i;
    coords.push(`${(12 + radius * Math.cos(angle)).toFixed(2)},${(12 + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return coords.join(" ");
}

const STAR = regularPolygon(5, 10.5, 4.6, -Math.PI / 2);
const HEXAGON = regularPolygon(6, 10.5, null, 0);
</script>

<template>
  <svg class="option-shape" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <polygon v-if="shape === 'triangle'" points="12,2.5 22,20.5 2,20.5" />
    <polygon v-else-if="shape === 'diamond'" points="12,1.5 22.5,12 12,22.5 1.5,12" />
    <circle v-else-if="shape === 'circle'" cx="12" cy="12" r="10" />
    <rect v-else-if="shape === 'square'" x="3" y="3" width="18" height="18" rx="1.5" />
    <polygon v-else-if="shape === 'star'" :points="STAR" />
    <polygon v-else :points="HEXAGON" />
  </svg>
</template>

<style scoped>
.option-shape {
  width: var(--icon);
  height: var(--icon);
  flex: none;
  fill: currentColor;
}
</style>
