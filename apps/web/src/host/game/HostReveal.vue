<script setup lang="ts">
import type { FieldGroups, QuestionRevealEvent, QuestionStartEvent } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import {
  HOST_PROMPT_FIT,
  charCount,
  hostOrderColumns,
  hostOrderFit,
  smallerFit,
  textFit,
  type TextFit,
} from "@/components/choiceLayout";
import { format, sk } from "@/i18n/sk";
import { formatPercent } from "@/lib/format";
import { formatNumber } from "@/lib/number";
import ChoiceBars from "./ChoiceBars.vue";
import HotspotHeatmap from "./HotspotHeatmap.vue";
import NumberGuesses from "./NumberGuesses.vue";
import TextAnswerGroups from "./TextAnswerGroups.vue";

type FieldKey = FieldGroups["key"];

/**
 * Reveal of the correct answer + statistics per question type, „Ďalej“.
 * Fits the stage height: long lists (order, guesses, answer groups) scroll
 * inside their own box, never the page.
 */
const props = defineProps<{
  question: QuestionStartEvent;
  reveal: QuestionRevealEvent | null;
  /** `{fieldKey}:{normalized}` keys with an override in flight. */
  pendingOverrides: ReadonlySet<string>;
  advancing: boolean;
}>();
const emit = defineEmits<{ next: []; override: [fieldKey: FieldKey, normalized: string, accept: boolean] }>();

/** Smaller than on the question screen: the statistics need the room. */
const promptFit = computed(() => smallerFit(textFit(charCount(props.question.prompt), HOST_PROMPT_FIT)));

const orderItems = computed(() => (props.reveal?.correct.type === "order" ? props.reveal.correct.items : []));
const orderColumns = computed(() => hostOrderColumns(orderItems.value.length));
const orderFit = computed(() => hostOrderFit(orderItems.value));

const options = computed(() =>
  props.question.type === "single" || props.question.type === "multi" ? props.question.options : [],
);

const correctIds = computed<string[]>(() => {
  const c = props.reveal?.correct;
  if (c?.type === "single") return [c.correctId];
  if (c?.type === "multi") return c.correctIds;
  return [];
});

/** Correct answers of text / music fields with the groups of the same field. */
const textFields = computed(() => {
  const r = props.reveal;
  if (!r || (r.correct.type !== "text" && r.correct.type !== "music")) return [];
  const stats = r.stats.type === "text" || r.stats.type === "music" ? r.stats.fields : [];
  const two = r.correct.fields.length > 1;
  const fit = (text: string): TextFit => {
    const step = textFit(charCount(text), HOST_PROMPT_FIT);
    return two ? smallerFit(step) : step;
  };
  return r.correct.fields.map((f) => ({
    key: f.key,
    label: f.label ?? sk.fields[f.key],
    primary: f.accepted[0] ?? "",
    fit: fit(f.accepted[0] ?? ""),
    aliases: f.accepted.slice(1),
    groups: stats.find((s) => s.key === f.key)?.groups ?? [],
  }));
});

/** How the points of a `number` question were decided, shown under the correct number. */
const numberRule = computed(() => {
  const c = props.reveal?.correct;
  if (c?.type !== "number") return "";
  if (c.mode === "closest") return sk.game.numberClosest;
  if (c.tolerance === 0) return sk.game.numberExact;
  return format(sk.game.numberTolerance, { tolerance: `±${formatNumber(c.tolerance)}` });
});

function pendingFor(key: FieldKey): ReadonlySet<string> {
  const prefix = `${key}:`;
  return new Set([...props.pendingOverrides].filter((k) => k.startsWith(prefix)).map((k) => k.slice(prefix.length)));
}
</script>

<template>
  <section class="reveal">
    <header class="reveal__bar">
      <span class="reveal__index tabular">
        {{ format(sk.game.questionOf, { index: question.number, total: question.count }) }}
      </span>
    </header>

    <h1 class="reveal__prompt line-clamp" :class="`fit-${promptFit}`">{{ question.prompt }}</h1>

    <div v-if="!reveal" class="reveal__body">
      <p class="reveal__evaluating" role="status">{{ sk.game.evaluating }}</p>
    </div>

    <div v-else class="reveal__body" :class="`reveal__body--${reveal.correct.type}`">
      <ChoiceBars
        v-if="reveal.stats.type === 'single' || reveal.stats.type === 'multi'"
        :options="options"
        :votes="reveal.stats.votes"
        :correct-ids="correctIds"
        class="reveal__bars"
      />

      <template v-else-if="reveal.correct.type === 'order' && reveal.stats.type === 'order'">
        <h2 class="reveal__subtitle">{{ sk.game.correctOrder }}</h2>
        <ol
          class="reveal__order"
          :class="[`reveal__order--cols-${orderColumns}`, `fit-${orderFit}`]"
          :style="{ '--rows': Math.ceil(orderItems.length / orderColumns) }"
        >
          <li v-for="(item, i) in orderItems" :key="item.id" class="reveal__order-item" :style="{ '--i': i }">
            <span class="reveal__order-n tabular">{{ i + 1 }}.</span>
            <span>{{ item.text }}</span>
          </li>
        </ol>
        <p class="reveal__stat">
          {{ format(sk.game.averageSuccess, { percent: formatPercent(reveal.stats.averageCorrectness) }) }}
        </p>
      </template>

      <template v-else-if="reveal.correct.type === 'hotspot' && reveal.stats.type === 'hotspot'">
        <HotspotHeatmap
          v-if="question.media?.imageId"
          :image-id="question.media.imageId"
          :targets="reveal.correct.targets"
          :taps="reveal.stats.taps"
        />
      </template>

      <template v-else-if="reveal.correct.type === 'number' && reveal.stats.type === 'number'">
        <div class="reveal__answer">
          <span class="reveal__answer-label">{{ sk.game.correctAnswer }}</span>
          <strong class="reveal__answer-main tabular">✓ {{ formatNumber(reveal.correct.answer) }}</strong>
          <span class="reveal__answer-aliases">{{ numberRule }}</span>
        </div>
        <NumberGuesses class="reveal__guesses" :guesses="reveal.stats.guesses" :correct="reveal.correct.answer" />
      </template>

      <template v-else-if="textFields.length > 0">
        <div class="reveal__answers" :class="{ 'reveal__answers--two': textFields.length > 1 }">
          <div v-for="f in textFields" :key="f.key" class="reveal__answer">
            <span v-if="textFields.length > 1" class="reveal__answer-label">{{ f.label }}</span>
            <span v-else class="reveal__answer-label">{{ sk.game.correctAnswer }}</span>
            <strong class="reveal__answer-main line-clamp" :class="`fit-${f.fit}`">✓ {{ f.primary }}</strong>
            <span v-if="f.aliases.length > 0" class="reveal__answer-aliases line-clamp">{{ f.aliases.join(" · ") }}</span>
          </div>
        </div>
        <div class="reveal__groups" :class="{ 'reveal__groups--two': textFields.length > 1 }">
          <TextAnswerGroups
            v-for="f in textFields"
            :key="f.key"
            :label="f.label"
            :groups="f.groups"
            :pending="pendingFor(f.key)"
            @toggle="(normalized, accept) => emit('override', f.key, normalized, accept)"
          />
        </div>
        <p class="reveal__hint">{{ sk.game.groupsHint }}</p>
      </template>
    </div>

    <footer class="reveal__footer">
      <BaseButton variant="primary" large class="reveal__next" :loading="advancing" @click="$emit('next')">
        {{ sk.game.next }}
      </BaseButton>
    </footer>
  </section>
</template>

<style scoped>
/* bar · prompt · body (1fr, min-height 0) · footer – the stage never scrolls */
.reveal {
  display: flex;
  flex-direction: column;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
}

.reveal__bar,
.reveal__footer {
  flex: none;
}

.reveal__index {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-bold);
  color: var(--text-muted);
}

.reveal__prompt {
  --lines: 3;
  flex: none;
  font-size: calc(var(--fs-host-question) * var(--fit, 1));
  font-weight: var(--fw-bold);
  line-height: 1.2;
  text-align: center;
  overflow-wrap: anywhere;
}

.reveal__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
}

.reveal__evaluating {
  font-size: var(--fs-host-option);
  color: var(--text-muted);
}

.reveal__subtitle {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

/* correct order: two columns (read down, then across) for more than 4 items, scrolls inside if still too long */
.reveal__order {
  flex: 0 1 auto;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(var(--rows), auto);
  gap: var(--s-3) var(--s-5);
  width: min(100%, var(--stage-list-w));
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.reveal__order--cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
}

.reveal__order-item {
  display: flex;
  gap: var(--s-4);
  padding: var(--stage-tile-pad) var(--s-5);
  border-left: var(--ring-selected) solid var(--success);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: calc(var(--fs-host-option) * var(--fit, 1));
  line-height: 1.25;
  overflow-wrap: anywhere;
  font-weight: var(--fw-semibold);
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger) * 2);
}

.reveal__order-n {
  flex: none;
  min-width: var(--rank-col);
  font-weight: var(--fw-black);
  color: var(--success);
}

.reveal__stat {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-bold);
}

.reveal__answers {
  display: grid;
  gap: var(--s-5);
  width: 100%;
  text-align: center;
}

.reveal__answers--two,
.reveal__groups--two {
  grid-template-columns: 1fr 1fr;
}

.reveal__answer {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  min-width: 0;
}

.reveal__answer-label {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.reveal__answer-main {
  --lines: 2;
  font-size: calc(var(--fs-host-question) * var(--fit, 1));
  line-height: 1.2;
  font-weight: var(--fw-black);
  color: var(--success);
  overflow-wrap: anywhere;
}

.reveal__answer-aliases {
  --lines: 2;
  color: var(--text-muted);
}

/* bars and answer groups take the rest of the height; lists scroll inside their own box */
.reveal__bars {
  flex: 1 1 0;
  min-height: 0;
}

.reveal__guesses {
  flex: 0 1 auto;
  min-height: 0;
}

.reveal__groups {
  flex: 1 1 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  gap: var(--s-5);
  width: 100%;
  min-height: 0;
}

.reveal__hint {
  font-size: var(--fs-host-label);
  color: var(--text-muted);
}

.reveal__footer {
  display: flex;
  justify-content: flex-end;
}

.reveal__next {
  font-size: var(--fs-host-option);
  padding: 0 var(--s-7);
}

@media (max-width: 600px) {
  .reveal__answers--two,
  .reveal__groups--two {
    grid-template-columns: 1fr;
  }

  .reveal__groups--two {
    grid-template-rows: repeat(2, minmax(0, 1fr));
  }

  .reveal__order--cols-2 {
    grid-template-columns: minmax(0, 1fr);
    grid-auto-flow: row;
    grid-template-rows: none;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(calc(var(--s-5) * var(--motion)));
  }
}
</style>
