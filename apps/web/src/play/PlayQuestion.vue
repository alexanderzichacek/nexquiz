<script setup lang="ts">
import type { AnswerPayload, PublicField, QuestionStartEvent } from "@nexquiz/shared";
import { computed, ref, toRef, watch } from "vue";
import { PLAYER_PROMPT_FIT, charCount, textFit } from "@/components/choiceLayout";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { HAPTIC_SUBMIT, vibrate } from "@/lib/haptics";
import type { UnitPoint } from "@/lib/imageFit";
import { TIMER_DANGER_SECONDS } from "@/lib/serverClock";
import { useCountdown } from "@/lib/useCountdown";
import { useToastStore } from "@/stores/toast";
import ChoiceAnswer from "./ChoiceAnswer.vue";
import HotspotAnswer from "./HotspotAnswer.vue";
import NumberAnswer from "./NumberAnswer.vue";
import OrderAnswer from "./OrderAnswer.vue";
import PlayerClip from "./PlayerClip.vue";
import PlayerVideo from "./PlayerVideo.vue";
import TextAnswer from "./TextAnswer.vue";
import TimerBar from "./TimerBar.vue";
import type { AnswerOutcome } from "./usePlayGame";
import { usePlayerMedia } from "./usePlayerMedia";

/**
 * Player question screen: sticky header (index/total, TimerBar, seconds),
 * the prompt and the input per type. After sending, the „Odpoveď odoslaná“
 * overlay; at the deadline the input locks („Čas vypršal.“).
 * The screen never scrolls: header · prompt (scaled by length) · image
 * (shrinks first) · the answer area, which takes the rest of the height
 * (choice answers keep their natural height at the bottom, the image takes the rest).
 * With sound and video on, the video, the audio clip and the tick of the last
 * seconds play on this device too.
 */
const props = defineProps<{
  question: QuestionStartEvent;
  clockOffset: number;
  hasAnswered: boolean;
  send: (payload: AnswerPayload) => Promise<AnswerOutcome>;
}>();

const toast = useToastStore();

const deadline = computed<number | null>(() => props.question.deadline);
const countdown = useCountdown(deadline, toRef(() => props.clockOffset));

const sending = ref(false);
const late = ref(false);
const locked = computed(() => props.hasAnswered || sending.value || late.value || countdown.expired.value);
const timeUp = computed(() => !props.hasAnswered && (late.value || countdown.expired.value));

const media = usePlayerMedia();

const imageId = computed(() => props.question.media?.imageId);
/** Shown in place of an image, only with sound and video on. */
const videoId = computed(() => (media.enabled.value ? props.question.media?.videoId : undefined));
const showImage = computed(() => imageId.value !== undefined && props.question.type !== "hotspot");
/** Clip of a music question or a text question with audio (e.g. fill in the lyrics). */
const clip = computed(() =>
  props.question.type === "music" || props.question.type === "text" ? props.question.clip : undefined,
);

// Tick in the last seconds, like the host screen (not over a clip).
watch(countdown.seconds, (s, prev) => {
  if (!media.enabled.value || clip.value || props.hasAnswered) return;
  if (s !== prev && s > 0 && s <= TIMER_DANGER_SECONDS) media.audio.tick();
});
const isChoice = computed(() => props.question.type === "single" || props.question.type === "multi");
const promptFit = computed(() => textFit(charCount(props.question.prompt), PLAYER_PROMPT_FIT));

async function submit(payload: AnswerPayload): Promise<void> {
  if (locked.value) return;
  sending.value = true;
  vibrate(HAPTIC_SUBMIT);
  try {
    const outcome = await props.send(payload);
    if (outcome === "late") late.value = true;
    else if (outcome === "error") toast.show(sk.errors.generic, "error");
  } finally {
    sending.value = false;
  }
}

function submitText(answers: Partial<Record<PublicField["key"], string>>): void {
  if (props.question.type === "music") {
    void submit({ answers: { artist: answers.artist ?? "", title: answers.title ?? "" } });
  } else {
    void submit({ answers: { answer: answers.answer ?? "" } });
  }
}

function submitPoint(point: UnitPoint): void {
  void submit({ x: point.x, y: point.y });
}
</script>

<template>
  <section class="pq">
    <header class="pq__header">
      <span class="pq__index tabular">
        {{ format(sk.play.questionOf, { index: question.number, total: question.count }) }}
      </span>
      <TimerBar
        :remaining-ms="countdown.remaining.value"
        :total-ms="question.timeLimit * 1000"
        :seconds="countdown.seconds.value"
        :milestone="countdown.milestone.value"
      />
      <span class="pq__seconds tabular" aria-hidden="true">
        {{ format(sk.play.secondsLeft, { seconds: countdown.seconds.value }) }}
      </span>
    </header>

    <div
      class="pq__content"
      :class="{
        'pq__content--dimmed': hasAnswered || timeUp,
        'pq__content--media': showImage || videoId,
        'pq__content--choice': isChoice,
      }"
    >
      <h1 class="pq__prompt line-clamp" :class="`fit-${promptFit}`">{{ question.prompt }}</h1>
      <img v-if="showImage && imageId" :src="mediaUrl(imageId)" alt="" class="pq__image" />
      <PlayerVideo v-else-if="videoId" :key="question.index" :video-id="videoId" class="pq__image" />

      <div class="pq__answer" :class="{ 'pq__answer--list': question.type === 'order', 'pq__answer--choice': isChoice }">
        <ChoiceAnswer
          v-if="question.type === 'single' || question.type === 'multi'"
          :type="question.type"
          :options="question.options"
          :locked="locked"
          @single="(optionId) => submit({ optionId })"
          @multi="(optionIds) => submit({ optionIds })"
        />
        <OrderAnswer
          v-else-if="question.type === 'order'"
          :items="question.items"
          :locked="locked"
          @submit="(order) => submit({ order })"
        />
        <HotspotAnswer
          v-else-if="question.type === 'hotspot' && imageId"
          :image-id="imageId"
          :locked="locked"
          @submit="submitPoint"
        />
        <TextAnswer
          v-else-if="question.type === 'text' || question.type === 'music'"
          :type="question.type"
          :fields="question.fields"
          :listen="question.type === 'text' && question.clip !== undefined"
          :locked="locked"
          @submit="submitText"
        >
          <template v-if="media.enabled.value && clip" #listen>
            <PlayerClip :index="question.index" :duration="clip.duration" />
          </template>
        </TextAnswer>
        <NumberAnswer
          v-else-if="question.type === 'number'"
          :mode="question.mode"
          :tolerance="question.tolerance"
          :locked="locked"
          @submit="(value) => submit({ value })"
        />
      </div>
    </div>

    <Transition name="pq-overlay">
      <div v-if="hasAnswered" class="pq__overlay" role="status">
        <p class="pq__overlay-text">{{ sk.play.submitted }}</p>
        <p class="pq__overlay-sub">{{ sk.play.waitingOthers }}</p>
      </div>
      <div v-else-if="timeUp" class="pq__overlay pq__overlay--late" role="status">
        <p class="pq__overlay-text">{{ sk.play.timeUp }}</p>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.pq {
  position: relative;
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}

.pq__header {
  position: relative;
  z-index: 10;
  flex: none;
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-2) 0 var(--s-3);
  background: var(--play-bg);
  font-size: var(--fs-player-timer);
  font-weight: var(--fw-bold);
}

.pq__seconds {
  min-width: var(--seconds-w);
  text-align: right;
}

.pq__content {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  flex: 1;
  min-height: 0;
  transition: opacity var(--t) var(--ease);
}

.pq__content--dimmed {
  opacity: var(--opacity-muted);
  pointer-events: none;
}

/* shrinks only when the answers need the room (e.g. an open keyboard) */
.pq__prompt {
  --lines: 8;
  flex: 0 0.1 auto;
  min-height: 0;
  font-size: max(var(--fs-player-prompt-min), calc(var(--fs-player-question) * var(--fit, 1)));
  font-weight: var(--fw-semibold);
  line-height: 1.25;
  overflow-wrap: anywhere;
  animation: rise var(--t-slow) var(--ease) both;
}

/* up to 30 % of the height; shrinks (down to 0) when the answers need the room */
.pq__image {
  flex: 0 10 var(--h-player-image);
  width: 100%;
  min-height: 0;
  object-fit: contain;
  border-radius: var(--radius-sm);
}

/*
 * The answer components fill this column (their root: flex 1, min-height 0).
 * It never gets smaller than its content minimum (tiles ≥ --h-player-tile,
 * inputs + Odoslať), so the image and then the prompt give way instead.
 */
.pq__answer {
  display: flex;
  flex-direction: column;
  flex: 1 1 0;
}

/* the order list scrolls inside: keep at least half of the height for it */
.pq__answer--list {
  min-height: 50%;
}

/*
 * Choice: the answers keep their natural height at the bottom (thumb zone,
 * never stretched); the image is the flexible part and takes the rest.
 */
.pq__answer--choice {
  flex: 0 1 auto;
  min-height: 0;
  margin-top: auto;
}

.pq__content--choice .pq__image {
  flex: 1 1 0;
}

/* landscape phone (short screen): image left, answers right, the prompt above both */
@media (orientation: landscape) and (max-height: 599px) {
  .pq__content--media {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    grid-template-rows: auto minmax(0, 1fr);
    column-gap: var(--s-4);
  }

  .pq__content--media .pq__prompt {
    grid-column: 1 / -1;
  }

  .pq__content--media .pq__image {
    height: 100%;
  }

  .pq__content--media .pq__answer {
    min-height: 0;
  }

  .pq__content--media .pq__answer--choice {
    align-self: end;
  }
}

.pq__overlay {
  position: absolute;
  inset: 0;
  z-index: 20;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-2);
  padding: var(--s-5);
  text-align: center;
}

.pq__overlay-text {
  padding: var(--s-4) var(--s-5);
  border-radius: var(--radius-lg);
  background: var(--success);
  color: var(--primary-contrast);
  font-size: var(--fs-player-question);
  font-weight: var(--fw-bold);
  box-shadow: var(--shadow-lg);
}

.pq__overlay--late .pq__overlay-text {
  background: var(--danger);
}

.pq__overlay-sub {
  font-weight: var(--fw-semibold);
}

.pq-overlay-enter-active,
.pq-overlay-leave-active {
  transition:
    opacity var(--t-fast) var(--ease),
    transform var(--t-fast) var(--ease);
}

.pq-overlay-enter-from,
.pq-overlay-leave-to {
  opacity: 0;
  transform: scale(calc(1 - 0.05 * var(--motion)));
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(calc(var(--s-4) * var(--motion)));
  }
}
</style>
