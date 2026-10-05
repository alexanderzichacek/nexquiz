<script setup lang="ts">
import { computed } from "vue";
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
  }>(),
  { state: "idle", size: "player", readonly: false },
);

defineEmits<{ select: [] }>();

const style = computed(() => ({ "--tile-color": optionColor(props.index) }));
const letter = computed(() => optionLetter(props.index));
const tag = computed(() => (props.readonly ? "div" : "button"));
</script>

<template>
  <component
    :is="tag"
    :type="readonly ? undefined : 'button'"
    class="tile"
    :class="[`tile--${state}`, `tile--${size}`]"
    :style="style"
    :disabled="readonly ? undefined : state === 'disabled'"
    :aria-pressed="readonly ? undefined : state === 'selected'"
    @click="readonly || state === 'disabled' ? undefined : $emit('select')"
  >
    <OptionShape :index="index" class="tile__shape" />
    <span class="tile__letter">{{ letter }}</span>
    <span class="tile__text">{{ text }}</span>
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

.tile--player {
  font-size: var(--fs-player-option);
}

.tile--host {
  font-size: var(--fs-host-option);
  padding: var(--s-4) var(--s-5);
}

.tile--compact {
  font-size: var(--fs-editor-option);
  min-height: var(--btn-h);
}

.tile--host .tile__shape {
  width: 1.2em;
  height: 1.2em;
}

.tile__letter {
  font-weight: var(--fw-black);
}

.tile__text {
  flex: 1;
  overflow-wrap: anywhere;
}

.tile__check {
  font-weight: var(--fw-black);
}

.tile--selected {
  box-shadow:
    0 0 0 var(--ring-selected) var(--on-option),
    var(--shadow-lg);
}

.tile--wrong {
  opacity: var(--opacity-muted);
}

.tile--disabled {
  opacity: var(--opacity-disabled);
  cursor: not-allowed;
}
</style>
