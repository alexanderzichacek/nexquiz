<script setup lang="ts">
import type { QuestionProgressEvent, QuestionStartEvent } from "@nexquiz/shared";
import { computed } from "vue";
import AnswerTile from "@/components/AnswerTile.vue";
import BaseButton from "@/components/BaseButton.vue";
import {
  HOST_PROMPT_FIT,
  charCount,
  hostChoiceColumns,
  hostOptionFit,
  hostOrderColumns,
  hostOrderFit,
  textFit,
} from "@/components/choiceLayout";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { formatNumber } from "@/lib/number";
import AnsweredCounter from "./AnsweredCounter.vue";
import AudioControl from "./AudioControl.vue";
import TimerRing from "./TimerRing.vue";

/**
 * Question on the host screen: index/total + „Ukončiť otázku teraz“, TimerRing,
 * answered counter and the type-specific body. Everything shares the stage
 * height (no scrolling): media shrinks, long prompts / options scale down.
 */
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
const promptFit = computed(() => textFit(charCount(props.question.prompt), HOST_PROMPT_FIT));
const optionFit = computed(() => hostOptionFit(options.value));
const orderItems = computed(() => (props.question.type === "order" ? props.question.items : []));
const orderColumns = computed(() => hostOrderColumns(orderItems.value.length));
const orderFit = computed(() => hostOrderFit(orderItems.value));
const imageId = computed(() => props.question.media?.imageId);
const audioId = computed(() => props.question.media?.audioId);
const videoId = computed(() => props.question.media?.videoId);
/** Image / video above the answers (the hotspot image is the answer area itself). */
const hasMedia = computed(() => (imageId.value !== undefined && props.question.type !== "hotspot") || videoId.value !== undefined);
const musicLabels = computed(() => {
  if (props.question.type !== "music") return "";
  const label = (key: "artist" | "title"): string =>
    (props.question.type === "music" ? props.question.fields.find((f) => f.key === key)?.label : undefined) ??
    sk.fields[key];
  return format(sk.game.musicFields, { artist: label("artist"), title: label("title") });
});
/** How the points of a `number` question are decided (the correct number stays hidden until reveal). */
const numberRule = computed(() => {
  const q = props.question;
  if (q.type !== "number") return "";
  if (q.mode === "closest") return sk.game.numberClosest;
  if (q.tolerance === 0) return sk.game.numberExact;
  return format(sk.game.numberTolerance, { tolerance: `±${formatNumber(q.tolerance)}` });
});
</script>

<template>
  <section class="question">
    <header class="question__bar">
      <div class="question__meta">
        <span class="question__index tabular">
          {{ format(sk.game.questionOf, { index: question.number, total: question.count }) }}
        </span>
        <BaseButton variant="secondary" class="question__end" :loading="ending" @click="$emit('endQuestion')">
          {{ sk.game.endQuestion }}
        </BaseButton>
      </div>
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

    <h1 class="question__prompt line-clamp" :class="`fit-${promptFit}`">{{ question.prompt }}</h1>

    <div class="question__body" :class="[`question__body--${question.type}`, { 'question__body--media': hasMedia }]">
      <img
        v-if="imageId && question.type !== 'hotspot'"
        :src="mediaUrl(imageId)"
        alt=""
        class="question__media"
      />
      <video
        v-else-if="videoId"
        :key="`${question.index}`"
        :src="mediaUrl(videoId)"
        class="question__media"
        controls
        autoplay
        playsinline
        preload="auto"
      ></video>

      <ul
        v-if="question.type === 'single' || question.type === 'multi'"
        class="question__tiles"
        :class="[`question__tiles--cols-${columns}`, `fit-${optionFit}`]"
      >
        <li v-for="(o, i) in options" :key="o.id" class="question__tile" :style="{ '--i': i }">
          <AnswerTile :index="i" :text="o.text" size="host" readonly fill class="question__tile-box" />
        </li>
      </ul>

      <template v-else-if="question.type === 'order'">
        <ul
          class="question__order"
          :class="[`question__order--cols-${orderColumns}`, `fit-${orderFit}`]"
          :style="{ '--rows': Math.ceil(orderItems.length / orderColumns) }"
        >
          <li v-for="(item, i) in orderItems" :key="item.id" class="question__order-item" :style="{ '--i': i }">
            <span class="question__order-text line-clamp">{{ item.text }}</span>
          </li>
        </ul>
        <p class="question__hint">{{ sk.game.orderHint }}</p>
      </template>

      <template v-else-if="question.type === 'hotspot'">
        <img v-if="imageId" :src="mediaUrl(imageId)" alt="" class="question__media question__media--hotspot" />
        <p class="question__hint">{{ sk.game.hotspotHint }}</p>
      </template>

      <template v-else-if="question.type === 'text'">
        <AudioControl
          v-if="audioId && question.clip"
          :key="`${question.index}`"
          :audio-id="audioId"
          :clip="question.clip"
          @playing="$emit('audioPlaying', $event)"
        />
        <p class="question__hint question__hint--big">{{ sk.game.textHint }}</p>
      </template>

      <template v-else-if="question.type === 'number'">
        <p class="question__hint question__hint--big">{{ sk.game.numberHint }}</p>
        <p class="question__hint">{{ numberRule }}</p>
      </template>

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
  </section>
</template>

<style scoped>
/*
 * Column layout that never scrolls: bar · prompt (auto, clamped) · body (1fr).
 * In the body the media and the tiles share the height (both flex, min-height 0).
 */
.question {
  display: flex;
  flex-direction: column;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
}

.question__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  flex: none;
}

.question__meta {
  display: flex;
  align-items: center;
  gap: var(--s-4);
  min-width: 0;
}

.question__index {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-bold);
  color: var(--text-muted);
}

.question__end {
  font-size: var(--fs-host-label);
}

.question__status {
  display: flex;
  align-items: center;
  gap: var(--s-5);
}

.question__prompt {
  --lines: 4;
  flex: none;
  font-size: calc(var(--fs-host-question) * var(--fit, 1));
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
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
}

/* image / video: fills the free height, never pushes the tiles off the screen */
.question__media {
  flex: 1 1 0;
  width: 100%;
  min-height: var(--stage-media-min);
  object-fit: contain;
  border-radius: var(--radius);
}

.question__media--hotspot {
  min-height: 0;
  border-radius: 0;
}

/* tiles share the height equally (rows 1fr); the text scales down (fit-*) and clamps */
.question__tiles {
  display: grid;
  grid-auto-rows: minmax(var(--tap-min), 1fr);
  gap: var(--s-4);
  flex: 1 1 0;
  width: 100%;
  min-height: 0;
  max-height: var(--stage-tiles-max);
  margin: 0;
  padding: 0;
  list-style: none;
}

.question__body--media .question__tiles {
  flex-grow: 0.7;
}

/* longer options get a bigger share of the height next to the media */
.question__body--media .question__tiles.fit-s {
  flex-grow: 1;
}

.question__body--media .question__tiles.fit-xs {
  flex-grow: 1.5;
}

.question__tiles--cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.question__tiles--cols-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.question__tile {
  display: flex;
  min-height: 0;
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger));
}

/* size container: the text never makes the tile taller (AnswerTile `fill` clamps the lines) */
.question__tile-box {
  container-type: size;
  height: 100%;
  min-height: 0;
}

/* order: static list, two columns (read down, then across) for more than 4 items */
.question__order {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(var(--rows), minmax(0, auto));
  gap: var(--s-3) var(--s-5);
  flex: 0 1 auto;
  width: min(100%, var(--stage-list-w));
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.question__order--cols-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
}

.question__order-item {
  display: flex;
  align-items: center;
  min-height: 0;
  padding: var(--stage-tile-pad) var(--s-5);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: calc(var(--fs-host-option) * var(--fit, 1));
  font-weight: var(--fw-semibold);
  line-height: 1.25;
  overflow: hidden;
  animation: rise var(--t-slow) var(--ease) both;
  animation-delay: calc(var(--i) * var(--t-stagger));
}

.question__order-text {
  --lines: 2;
  overflow-wrap: anywhere;
}

.question__hint {
  flex: none;
  color: var(--text-muted);
  text-align: center;
}

.question__hint--big {
  font-size: var(--fs-host-option);
}

@media (max-width: 600px) {
  .question__tiles--cols-2,
  .question__tiles--cols-3,
  .question__order--cols-2 {
    grid-template-columns: minmax(0, 1fr);
  }

  .question__order--cols-2 {
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
