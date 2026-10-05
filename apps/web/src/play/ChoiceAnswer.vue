<script setup lang="ts">
import type { Option } from "@nexquiz/shared";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import AnswerTile, { type AnswerTileState } from "@/components/AnswerTile.vue";
import { playerChoiceGrid } from "@/components/choiceLayout";
import { sk } from "@/i18n/sk";
import { optionIndexForKey } from "@/lib/answerKeys";
import SubmitBar from "./SubmitBar.vue";

/**
 * `single`: one tap submits. `multi`: toggle tiles + „Odoslať“.
 * On PC the keys A–F / 1–6 pick the option with that letter / number.
 */
const props = defineProps<{ type: "single" | "multi"; options: readonly Option[]; locked: boolean }>();
const emit = defineEmits<{ single: [optionId: string]; multi: [optionIds: string[]] }>();

const selected = ref<string[]>([]);
const grid = computed(() => playerChoiceGrid(props.options));

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
  <p v-if="type === 'multi'" class="choice__hint">{{ sk.play.multiHint }}</p>
  <div class="choice" :class="{ 'choice--grid': grid }">
    <AnswerTile
      v-for="(o, i) in options"
      :key="o.id"
      :index="i"
      :text="o.text"
      :state="state(o.id)"
      class="choice__tile"
      :style="{ '--i': i }"
      @select="pick(o.id)"
    />
  </div>
  <p class="choice__keys">{{ sk.play.keyboardHint }}</p>
  <SubmitBar v-if="type === 'multi'" :disabled="locked || selected.length === 0" @submit="submitMulti" />
</template>

<style scoped>
.choice {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--s-2);
}

.choice--grid {
  grid-template-columns: 1fr 1fr;
}

.choice--grid .choice__tile {
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  min-height: calc(var(--btn-h-player) * 2);
}

.choice__tile {
  min-height: var(--btn-h-player);
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger));
}

.choice__hint {
  color: var(--text-muted);
  font-size: var(--fs-small);
}

.choice__keys {
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
