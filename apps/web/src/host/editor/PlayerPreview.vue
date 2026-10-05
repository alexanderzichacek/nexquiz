<script setup lang="ts">
import type { Question } from "@nexquiz/shared";
import { computed, ref } from "vue";
import AnswerTile from "@/components/AnswerTile.vue";
import BaseButton from "@/components/BaseButton.vue";
import BaseDialog from "@/components/BaseDialog.vue";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { playerChoiceGrid } from "@/components/choiceLayout";

/**
 * „Náhľad hráča“: how the selected question looks on a player's phone.
 * Only public parts are shown (order items shuffled, no correct answers).
 */
const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{ question: Question; index: number; total: number }>();

const selected = ref<string[]>([]);

const options = computed(() =>
  props.question.type === "single" || props.question.type === "multi" ? props.question.data.options : [],
);
const grid = computed(() => playerChoiceGrid(options.value));
/** Rotated by one, so the preview is never in the correct order. */
const shuffledItems = computed(() => {
  if (props.question.type !== "order") return [];
  const items = props.question.data.items;
  return items.length > 1 ? [...items.slice(1), items[0]].filter((i) => i !== undefined) : items;
});
const imageId = computed(() => (props.question.type === "music" ? undefined : props.question.media?.imageId));
const textFields = computed(() =>
  props.question.type === "text" || props.question.type === "music" ? props.question.data.fields : [],
);

function toggle(id: string): void {
  if (props.question.type === "single") {
    selected.value = [id];
  } else {
    selected.value = selected.value.includes(id) ? selected.value.filter((s) => s !== id) : [...selected.value, id];
  }
}

function tileState(id: string): "idle" | "selected" | "wrong" {
  if (selected.value.includes(id)) return "selected";
  return props.question.type === "single" && selected.value.length > 0 ? "wrong" : "idle";
}
</script>

<template>
  <BaseDialog v-model:open="open" :title="format(sk.editor.previewTitle, { index: index + 1 })">
    <div class="phone">
      <header class="phone__bar tabular">
        <span>{{ index + 1 }}/{{ total }}</span>
        <span class="phone__timer" aria-hidden="true"><span class="phone__timer-fill"></span></span>
        <span>{{ question.timeLimit }}</span>
      </header>

      <p class="phone__prompt">{{ question.prompt || sk.editor.untitledQuestion }}</p>
      <img v-if="imageId && question.type !== 'hotspot'" :src="mediaUrl(imageId)" alt="" class="phone__image" />

      <template v-if="question.type === 'single' || question.type === 'multi'">
        <div class="phone__tiles" :class="{ 'phone__tiles--grid': grid }">
          <AnswerTile
            v-for="(o, i) in options"
            :key="o.id"
            :index="i"
            :text="o.text"
            :state="tileState(o.id)"
            @select="toggle(o.id)"
          />
        </div>
        <BaseButton v-if="question.type === 'multi'" variant="primary" block large>{{ sk.play.submit }}</BaseButton>
      </template>

      <template v-else-if="question.type === 'order'">
        <ul class="phone__order">
          <li v-for="item in shuffledItems" :key="item.id" class="phone__order-item">
            <span aria-hidden="true">⠿</span>
            <span class="phone__order-text">{{ item.text }}</span>
            <span aria-hidden="true">↑↓</span>
          </li>
        </ul>
        <BaseButton variant="primary" block large>{{ sk.play.submit }}</BaseButton>
      </template>

      <template v-else-if="question.type === 'hotspot'">
        <img v-if="question.media?.imageId" :src="mediaUrl(question.media.imageId)" alt="" class="phone__image" />
        <BaseButton variant="primary" block large>{{ sk.play.submit }}</BaseButton>
      </template>

      <template v-else>
        <p v-if="question.type === 'music'" class="phone__listen">{{ sk.play.listen }}</p>
        <label v-for="f in textFields" :key="f.key" class="phone__field">
          <span v-if="question.type === 'music'" class="phone__label">{{ f.label ?? sk.fields[f.key] }}</span>
          <input
            class="phone__input"
            :placeholder="question.type === 'text' ? sk.play.answerPlaceholder : undefined"
            :aria-label="f.label ?? sk.fields[f.key]"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
          />
        </label>
        <BaseButton variant="primary" block large>{{ sk.play.submit }}</BaseButton>
      </template>
    </div>
  </BaseDialog>
</template>

<style scoped>
.phone {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  width: 100%;
  max-width: var(--w-player);
  max-height: var(--h-preview-max);
  overflow-y: auto;
  margin: 0 auto;
  padding: var(--s-4);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg);
  font-size: var(--fs-body);
}

.phone__bar {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  font-size: var(--fs-player-timer);
  font-weight: var(--fw-bold);
}

.phone__timer {
  flex: 1;
  height: var(--s-2);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  overflow: hidden;
}

.phone__timer-fill {
  display: block;
  width: 100%;
  height: 100%;
  background: var(--primary);
}

.phone__prompt {
  font-size: var(--fs-player-question);
  font-weight: var(--fw-semibold);
  overflow-wrap: anywhere;
}

.phone__image {
  width: 100%;
  border-radius: var(--radius-sm);
  object-fit: contain;
}

.phone__tiles {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--s-2);
}

.phone__tiles--grid {
  grid-template-columns: 1fr 1fr;
}

.phone__order {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.phone__order-item {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  min-height: var(--tap-min);
  padding: 0 var(--s-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: var(--fs-player-option);
  font-weight: var(--fw-semibold);
}

.phone__order-text {
  flex: 1;
}

.phone__listen {
  font-size: var(--fs-player-question);
  font-weight: var(--fw-bold);
  text-align: center;
}

.phone__field {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
}

.phone__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.phone__input {
  width: 100%;
  min-height: var(--input-h);
  padding: 0 var(--s-4);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
</style>
