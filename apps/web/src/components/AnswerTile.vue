<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import OptionShape from "./OptionShape.vue";
import { optionColor, optionLetter } from "./options";

export type AnswerTileState = "idle" | "selected" | "correct" | "wrong" | "disabled";

/**
 * Answer option: color `--opt-n` + shape icon + letter + text, so color is
 * never the only carrier of information.
 */
const props = withDefaults(
  defineProps<{
    index: number;
    text: string;
    state?: AnswerTileState;
    /** `player` (mobile), `host` (projector) or `compact` (editor). */
    size?: "player" | "host" | "compact";
    /** Renders a static element instead of a button (host screen). */
    readonly?: boolean;
    /**
     * Short options in a grid (player): shape + letter as a small badge in the
     * corner, the text larger and centered.
     */
    badge?: boolean;
    /**
     * The tile fills a fixed-height grid cell (game screens): the text is
     * clamped to the lines that fit, with an ellipsis instead of a cut line.
     */
    fill?: boolean;
  }>(),
  { state: "idle", size: "player", readonly: false, badge: false, fill: false },
);

defineEmits<{ select: [] }>();

const style = computed(() => ({
  "--tile-color": optionColor(props.index),
  ...(lines.value === null ? {} : { "--lines": lines.value }),
}));
const letter = computed(() => optionLetter(props.index));
const tag = computed(() => (props.readonly ? "div" : "button"));

// ---- `fill`: number of text lines that fit the tile height ----
const root = useTemplateRef<HTMLElement>("root");
const textEl = useTemplateRef<HTMLElement>("textEl");
const lines = ref<number | null>(null);
let observer: ResizeObserver | null = null;

function measure(): void {
  const el = root.value;
  const text = textEl.value;
  if (!props.fill || !el || !text) return;
  const box = getComputedStyle(el);
  const available = el.clientHeight - parseFloat(box.paddingTop) - parseFloat(box.paddingBottom);
  const lineHeight = parseFloat(getComputedStyle(text).lineHeight);
  if (!(lineHeight > 0)) return;
  lines.value = Math.max(1, Math.floor(available / lineHeight));
}

onMounted(() => {
  if (!props.fill) return;
  const el = root.value;
  if (!el) return;
  observer = new ResizeObserver(measure);
  observer.observe(el);
  measure();
});
onBeforeUnmount(() => observer?.disconnect());
watch(() => props.text, measure, { flush: "post" });
</script>

<template>
  <component
    :is="tag"
    ref="root"
    :type="readonly ? undefined : 'button'"
    class="tile"
    :class="[`tile--${state}`, `tile--${size}`, { 'tile--badge': badge }]"
    :style="style"
    :disabled="readonly ? undefined : state === 'disabled'"
    :aria-pressed="readonly ? undefined : state === 'selected'"
    @click="readonly || state === 'disabled' ? undefined : $emit('select')"
  >
    <span class="tile__mark">
      <OptionShape :index="index" class="tile__shape" />
      <span class="tile__letter">{{ letter }}</span>
    </span>
    <span ref="textEl" class="tile__text">{{ text }}</span>
    <span v-if="state === 'selected' || state === 'correct'" class="tile__check" aria-hidden="true">✓</span>
  </component>
</template>

<style scoped>
.tile {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  width: 100%;
  min-height: var(--tap-min);
  padding: var(--s-3) var(--s-4);
  overflow: hidden;
  border: 0;
  border-radius: var(--radius);
  background: var(--tile-color);
  color: var(--on-option);
  font-weight: var(--fw-semibold);
  text-align: left;
  box-shadow: var(--shadow);
  transition:
    opacity var(--t) var(--ease),
    transform var(--t-fast) var(--ease);
}

button.tile {
  cursor: pointer;
}

button.tile:active:not(:disabled) {
  transform: scale(calc(1 - 0.02 * var(--motion)));
}

/* `--fit` = text fit step of the parent (choiceLayout.ts), 1 when not set */
.tile--player {
  font-size: max(var(--fs-player-min), calc(var(--fs-player-option) * var(--fit, 1)));
}

.tile--host {
  font-size: max(var(--fs-host-label), calc(var(--fs-host-option) * var(--fit, 1)));
  padding: var(--stage-tile-pad) var(--s-5);
}

.tile--compact {
  font-size: var(--fs-editor-option);
  min-height: var(--btn-h);
}

.tile--host .tile__shape {
  width: 1.2em;
  height: 1.2em;
}

.tile__mark {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  flex: none;
}

.tile__letter {
  font-weight: var(--fw-black);
}

/* `fill` sets `--lines` (the lines that fit the tile height) */
.tile__text {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: var(--lines, none);
  flex: 1;
  min-width: 0;
  overflow: hidden;
  overflow-wrap: anywhere;
  line-height: 1.25;
}

/* player list rows: shape + letter in a fixed column, so the texts line up */
.tile--player .tile__letter {
  min-width: 1ch;
}

/* short options in a grid: small corner badge, larger centered text */
.tile--badge {
  position: relative;
  justify-content: center;
  padding: var(--s-5) var(--s-3) var(--s-3);
  text-align: center;
}

.tile--badge .tile__mark {
  position: absolute;
  top: var(--s-2);
  left: var(--s-3);
  gap: var(--s-1);
  font-size: var(--fs-label);
}

.tile--badge .tile__shape {
  width: var(--fs-label);
  height: var(--fs-label);
}

.tile--badge .tile__text {
  flex: 0 1 auto;
  font-size: max(var(--fs-player-min), calc(var(--fs-player-grid-option) * var(--fit, 1)));
  font-weight: var(--fw-bold);
}

.tile--badge .tile__check {
  position: absolute;
  top: var(--s-2);
  right: var(--s-3);
}
</style>
