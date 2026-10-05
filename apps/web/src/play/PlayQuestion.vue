<script setup lang="ts">
import type { AnswerPayload, PublicField, QuestionStartEvent } from "@nexquiz/shared";
import { computed, ref, toRef } from "vue";
import { format, sk } from "@/i18n/sk";
import { mediaUrl } from "@/lib/forms";
import { HAPTIC_SUBMIT, vibrate } from "@/lib/haptics";
import type { UnitPoint } from "@/lib/imageFit";
import { useCountdown } from "@/lib/useCountdown";
import { useToastStore } from "@/stores/toast";
import ChoiceAnswer from "./ChoiceAnswer.vue";
import HotspotAnswer from "./HotspotAnswer.vue";
import OrderAnswer from "./OrderAnswer.vue";
import TextAnswer from "./TextAnswer.vue";
import TimerBar from "./TimerBar.vue";
import type { AnswerOutcome } from "./usePlayGame";

/**
 * Player question screen: sticky header (index/total, TimerBar, seconds),
 * the prompt and the input per type. After sending, the „Odpoveď odoslaná“
 * overlay; at the deadline the input locks („Čas vypršal.“).
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

const imageId = computed(() => props.question.media?.imageId);

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
        {{ format(sk.play.questionOf, { index: question.index + 1, total: question.total }) }}
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

    <div class="pq__content" :class="{ 'pq__content--dimmed': hasAnswered || timeUp }">
      <h1 class="pq__prompt">{{ question.prompt }}</h1>
      <img v-if="imageId && question.type !== 'hotspot'" :src="mediaUrl(imageId)" alt="" class="pq__image" />

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
        :locked="locked"
        @submit="submitText"
      />
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
  position: sticky;
  top: 0;
  z-index: 10;
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
  gap: var(--s-4);
  flex: 1;
  transition: opacity var(--t) var(--ease);
}

.pq__content--dimmed {
  opacity: var(--opacity-muted);
  pointer-events: none;
}

.pq__prompt {
  font-size: var(--fs-player-question);
  font-weight: var(--fw-semibold);
  line-height: 1.3;
  overflow-wrap: anywhere;
  animation: rise var(--t-slow) var(--ease) both;
}

.pq__image {
  width: 100%;
  max-height: var(--h-player-image);
  object-fit: contain;
  border-radius: var(--radius-sm);
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
