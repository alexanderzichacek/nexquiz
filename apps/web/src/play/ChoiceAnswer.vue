<script setup lang="ts">
import type { Option } from "@nexquiz/shared";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AnswerTile, { type AnswerTileState } from "@/components/AnswerTile.vue";
import { playerChoiceLayout } from "@/components/choiceLayout";
import { sk } from "@/i18n/sk";
import { optionIndexForKey } from "@/lib/answerKeys";
import { useMediaQuery } from "@/lib/useMediaQuery";
import SubmitBar from "./SubmitBar.vue";

/**
 * `single`: one tap submits. `multi`: toggle tiles + „Odoslať“.
 * On PC the keys A–F / 1–6 pick the option with that letter / number.
 * Short options are tiles in a grid, anything longer a list (one row per
 * option); the block keeps its natural height at the bottom (thumb zone) and
 * the question image above takes the rest (`playerChoiceLayout`, choiceLayout.ts).
 */
const props = defineProps<{ type: "single" | "multi"; options: readonly Option[]; locked: boolean }>();
const emit = defineEmits<{ single: [optionId: string]; multi: [optionIds: string[]] }>();

const selected = ref<string[]>([]);
/** A wide, short screen (landscape phone): tiles side by side even with long texts. */
const landscape = useMediaQuery("(orientation: landscape) and (max-height: 599px)");
const layout = computed(() => playerChoiceLayout(props.options, landscape.value));

function pick(id: string): void {
  if (props.locked) return;
  if (props.type === "single") {
    selected.value = [id];
    emit("single", id);
    return;
  }
  selected.value = selected.value.includes(id) ? selected.value.filter((s) => s !== id) : [...selected.value, id];
}

function submitMulti(): void {
  if (props.locked || selected.value.length === 0) return;
  // Keep the option order of the question.
  emit(
    "multi",
    props.options.filter((o) => selected.value.includes(o.id)).map((o) => o.id),
  );
}

function state(id: string): AnswerTileState {
  const isSelected = selected.value.includes(id);
  if (isSelected) return "selected";
  if (props.locked) return props.type === "single" && selected.value.length > 0 ? "wrong" : "disabled";
  return "idle";
}

function onKey(event: KeyboardEvent): void {
  if (event.ctrlKey || event.metaKey || event.altKey) return;
  const target = event.target;
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
  const index = optionIndexForKey(event.key, props.options.length);
  const option = index === null ? undefined : props.options[index];
  if (!option) return;
  event.preventDefault();
  pick(option.id);
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <div class="choice-answer">
    <p v-if="type === 'multi'" class="choice__hint">{{ sk.play.multiHint }}</p>
    <div
      class="choice"
      :class="[
        `choice--${layout.mode}`,
        `fit-${layout.fit}`,
        { 'choice--odd': layout.columns === 2 && options.length % 2 === 1 },
      ]"
      :style="{ '--cols': layout.columns }"
    >
      <AnswerTile
        v-for="(o, i) in options"
        :key="o.id"
        :index="i"
        :text="o.text"
        :state="state(o.id)"
        :badge="layout.mode === 'grid'"
        fill
        class="choice__tile"
        :style="{ '--i': i }"
        @select="pick(o.id)"
      />
    </div>
    <p class="choice__keys">{{ sk.play.keyboardHint }}</p>
    <SubmitBar v-if="type === 'multi'" :disabled="locked || selected.length === 0" @submit="submitMulti" />
  </div>
</template>

<style scoped>
.choice-answer {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-height: 0;
}

/*
 * Natural height, never stretched to fill the screen: rows are equally tall
 * (`1fr` of an auto-height grid = the tallest row). If the screen is still too
 * short (image already gone), the block shrinks and the rows with it; the
 * tiles (`fill`) then clamp their text to the lines that still fit.
 */
.choice {
  display: grid;
  grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
  gap: var(--s-2);
  flex: 0 1 auto;
  min-height: 0;
}

/* list: compact rows (one line ≈ --h-player-tile), shape + letter left, up to 3 lines of text */
.choice--list {
  grid-auto-rows: minmax(var(--tap-min), 1fr);
}

.choice--list .choice__tile {
  --lines: 3;
  padding-block: var(--s-4);
}

/* grid: short options only, tiles of a fixed comfortable height */
.choice--grid {
  grid-auto-rows: minmax(var(--tap-min), var(--h-player-grid-tile));
}

.choice--grid .choice__tile {
  --lines: 2;
}

/* an odd last tile in two columns spans both (3 or 5 options) */
.choice--odd .choice__tile:last-child {
  grid-column: 1 / -1;
}

.choice__tile {
  height: 100%;
  min-height: var(--tap-min);
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger));
}

.choice__hint {
  flex: none;
  color: var(--text-muted);
  font-size: var(--fs-small);
}

.choice__keys {
  flex: none;
  display: none;
  color: var(--text-muted);
  font-size: var(--fs-small);
  text-align: center;
}

@media (hover: hover) and (pointer: fine) {
  .choice__keys {
    display: block;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(calc(var(--s-4) * var(--motion)));
  }
}
</style>
