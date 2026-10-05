<script setup lang="ts">
import type { QuestionProgressEvent, QuestionStartEvent } from "@nexquiz/shared";
import { computed } from "vue";
import AnswerTile from "@/components/AnswerTile.vue";
import BaseButton from "@/components/BaseButton.vue";
import { hostChoiceColumns } from "@/components/choiceLayout";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import AnsweredCounter from "./AnsweredCounter.vue";
import AudioControl from "./AudioControl.vue";
import TimerRing from "./TimerRing.vue";

/** Question on the host screen: index/total, TimerRing, answered counter and the type-specific body. */
const props = defineProps<{
  question: QuestionStartEvent;
  progress: QuestionProgressEvent | null;
  remainingMs: number;
  seconds: number;
  milestone: number | null;
  ending: boolean;
}>();
defineEmits<{ endQuestion: []; audioPlaying: [boolean] }>();

const options = computed(() =>
  props.question.type === "single" || props.question.type === "multi" ? props.question.options : [],
);
const columns = computed(() => hostChoiceColumns(options.value.length));
const imageId = computed(() => props.question.media?.imageId);
const audioId = computed(() => props.question.media?.audioId);
const musicLabels = computed(() => {
  if (props.question.type !== "music") return "";
  const label = (key: "artist" | "title"): string =>
    (props.question.type === "music" ? props.question.fields.find((f) => f.key === key)?.label : undefined) ??
    sk.fields[key];
  return format(sk.game.musicFields, { artist: label("artist"), title: label("title") });
});
</script>

<template>
  <section class="question">
    <header class="question__bar">
      <span class="question__index tabular">
        {{ format(sk.game.questionOf, { index: question.index + 1, total: question.total }) }}
      </span>
      <div class="question__status">
        <TimerRing
          :remaining-ms="remainingMs"
          :total-ms="question.timeLimit * 1000"
          :seconds="seconds"
          :milestone="milestone"
        />
        <AnsweredCounter v-if="progress" :answered="progress.answered" :total="progress.total" />
      </div>
    </header>

    <h1 class="question__prompt">{{ question.prompt }}</h1>

    <div class="question__body" :class="`question__body--${question.type}`">
      <img
        v-if="imageId && question.type !== 'hotspot'"
        :src="mediaUrl(imageId)"
        alt=""
        class="question__image"
      />

      <ul
        v-if="question.type === 'single' || question.type === 'multi'"
        class="question__tiles"
        :class="`question__tiles--cols-${columns}`"
      >
        <li v-for="(o, i) in options" :key="o.id" class="question__tile" :style="{ '--i': i }">
          <AnswerTile :index="i" :text="o.text" size="host" readonly />
        </li>
      </ul>

      <template v-else-if="question.type === 'order'">
        <ul class="question__order">
          <li v-for="(item, i) in question.items" :key="item.id" class="question__order-item" :style="{ '--i': i }">
            {{ item.text }}
          </li>
        </ul>
        <p class="question__hint">{{ sk.game.orderHint }}</p>
      </template>

      <template v-else-if="question.type === 'hotspot'">
        <img v-if="imageId" :src="mediaUrl(imageId)" alt="" class="question__hotspot" />
        <p class="question__hint">{{ sk.game.hotspotHint }}</p>
      </template>

      <p v-else-if="question.type === 'text'" class="question__hint question__hint--big">{{ sk.game.textHint }}</p>

      <template v-else-if="question.type === 'music'">
        <AudioControl
          v-if="audioId"
          :key="`${question.index}`"
          :audio-id="audioId"
          :clip="question.clip"
          @playing="$emit('audioPlaying', $event)"
        />
        <p class="question__hint question__hint--big">{{ musicLabels }}</p>
      </template>
    </div>

    <footer class="question__footer">
      <BaseButton variant="secondary" :loading="ending" @click="$emit('endQuestion')">
        {{ sk.game.endQuestion }}
      </BaseButton>
    </footer>
  </section>
</template>

<style scoped>
.question {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  flex: 1;
  min-height: 0;
}

.question__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
}

.question__index {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-bold);
  color: var(--text-muted);
}

.question__status {
  display: flex;
  align-items: center;
  gap: var(--s-5);
}

.question__prompt {
  font-size: var(--fs-host-question);
  font-weight: var(--fw-bold);
  line-height: 1.2;
  text-align: center;
  overflow-wrap: anywhere;
  animation: rise var(--t-slow) var(--ease) both;
}

.question__body {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-5);
  flex: 1;
  min-height: 0;
}

.question__image {
  max-width: 100%;
  max-height: var(--stage-image-h);
  object-fit: contain;
  border-radius: var(--radius);
}

.question__hotspot {
  width: 100%;
  flex: 1;
  min-height: 0;
  max-height: var(--stage-hotspot-h);
  object-fit: contain;
}

.question__tiles {
  display: grid;
  gap: var(--s-4);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.question__tiles--cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.question__tiles--cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.question__tile {
  display: flex;
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger));
}

.question__tile > * {
  min-height: calc(var(--btn-h-player) * 1.6);
}

.question__order {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  width: min(100%, var(--stage-list-w));
  margin: 0;
  padding: 0;
  list-style: none;
}

.question__order-item {
  padding: var(--s-3) var(--s-5);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--fs-host-option);
  font-weight: var(--fw-semibold);
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger));
}

.question__hint {
  color: var(--text-muted);
  text-align: center;
}

.question__hint--big {
  font-size: var(--fs-host-option);
}

.question__footer {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 900px) {
  .question__tiles--cols-2,
  .question__tiles--cols-3 {
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
