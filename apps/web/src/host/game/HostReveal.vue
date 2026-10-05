<script setup lang="ts">
import type { FieldGroups, QuestionRevealEvent, QuestionStartEvent } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { format, sk } from "@/i18n/sk";
import { formatPercent } from "@/lib/format";
import ChoiceBars from "./ChoiceBars.vue";
import HotspotHeatmap from "./HotspotHeatmap.vue";
import TextAnswerGroups from "./TextAnswerGroups.vue";

type FieldKey = FieldGroups["key"];

/** Reveal of the correct answer + statistics per question type, „Ďalej“. */
const props = defineProps<{
  question: QuestionStartEvent;
  reveal: QuestionRevealEvent | null;
  /** `{fieldKey}:{normalized}` keys with an override in flight. */
  pendingOverrides: ReadonlySet<string>;
  advancing: boolean;
}>();
const emit = defineEmits<{ next: []; override: [fieldKey: FieldKey, normalized: string, accept: boolean] }>();

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
  return r.correct.fields.map((f) => ({
    key: f.key,
    label: f.label ?? sk.fields[f.key],
    primary: f.accepted[0] ?? "",
    aliases: f.accepted.slice(1),
    groups: stats.find((s) => s.key === f.key)?.groups ?? [],
  }));
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
        {{ format(sk.game.questionOf, { index: question.index + 1, total: question.total }) }}
      </span>
    </header>

    <h1 class="reveal__prompt">{{ question.prompt }}</h1>

    <div v-if="!reveal" class="reveal__body">
      <p class="reveal__evaluating" role="status">{{ sk.game.evaluating }}</p>
    </div>

    <div v-else class="reveal__body" :class="`reveal__body--${reveal.correct.type}`">
      <ChoiceBars
        v-if="reveal.stats.type === 'single' || reveal.stats.type === 'multi'"
        :options="options"
        :votes="reveal.stats.votes"
        :correct-ids="correctIds"
      />

      <template v-else-if="reveal.correct.type === 'order' && reveal.stats.type === 'order'">
        <h2 class="reveal__subtitle">{{ sk.game.correctOrder }}</h2>
        <ol class="reveal__order">
          <li v-for="(item, i) in reveal.correct.items" :key="item.id" class="reveal__order-item" :style="{ '--i': i }">
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

      <template v-else-if="textFields.length > 0">
        <div class="reveal__answers" :class="{ 'reveal__answers--two': textFields.length > 1 }">
          <div v-for="f in textFields" :key="f.key" class="reveal__answer">
            <span v-if="textFields.length > 1" class="reveal__answer-label">{{ f.label }}</span>
            <span v-else class="reveal__answer-label">{{ sk.game.correctAnswer }}</span>
            <strong class="reveal__answer-main">✓ {{ f.primary }}</strong>
            <span v-if="f.aliases.length > 0" class="reveal__answer-aliases">{{ f.aliases.join(" · ") }}</span>
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
.reveal {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  flex: 1;
  min-height: 0;
}

.reveal__index {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-bold);
  color: var(--text-muted);
}

.reveal__prompt {
  font-size: var(--fs-host-question);
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
  gap: var(--s-5);
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

.reveal__order {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  width: min(100%, var(--stage-list-w));
  margin: 0;
  padding: 0;
  list-style: none;
}

.reveal__order-item {
  display: flex;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-5);
  border-left: var(--ring-selected) solid var(--success);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--fs-host-option);
  font-weight: var(--fw-semibold);
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger) * 2);
}

.reveal__order-n {
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
}

.reveal__answer-label {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.reveal__answer-main {
  font-size: var(--fs-host-question);
  font-weight: var(--fw-black);
  color: var(--success);
  overflow-wrap: anywhere;
}

.reveal__answer-aliases {
  color: var(--text-muted);
}

.reveal__groups {
  display: grid;
  gap: var(--s-5);
  width: 100%;
  flex: 1;
  min-height: 0;
  align-items: start;
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

@media (max-width: 900px) {
  .reveal__answers--two,
  .reveal__groups--two {
    grid-template-columns: 1fr;
  }
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(calc(var(--s-5) * var(--motion)));
  }
}
</style>
