<script setup lang="ts">
import type { PlayerResultEvent } from "@nexquiz/shared";
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";
import { formatDelta, formatScore, resultKind } from "@/lib/format";

/**
 * Player result of a question: full-screen state Správne / Čiastočne /
 * Nesprávne (color + icon + text) with the points. `text` / `music` also
 * show the own answer per field and the correct answers. No answer →
 * „Čas vypršal“ and 0 points.
 */
const props = defineProps<{ result: PlayerResultEvent }>();

const noAnswer = computed(() => props.result.yourAnswer === null);
const kind = computed(() => resultKind(props.result.correctness));
const icon = computed(() => (kind.value === "correct" ? "✓" : kind.value === "partial" ? "◐" : "✗"));
const title = computed(() => {
  if (noAnswer.value) return sk.play.timeUp;
  return kind.value === "correct" ? sk.play.correct : kind.value === "partial" ? sk.play.partial : sk.play.wrong;
});

/** Own answer and the correct answer per text / music field. */
const fields = computed(() => {
  const { correct, yourAnswer, perField } = props.result;
  if (correct.type !== "text" && correct.type !== "music") return [];
  const own: Partial<Record<string, string>> =
    yourAnswer?.type === "text" || yourAnswer?.type === "music" ? yourAnswer.payload.answers : {};
  return correct.fields.map((f) => ({
    key: f.key,
    label: f.label ?? sk.fields[f.key],
    own: own[f.key] ?? "",
    match: perField?.[f.key] ?? false,
    correct: f.accepted[0] ?? "",
  }));
});
</script>

<template>
  <section class="result" :class="`result--${noAnswer ? 'wrong' : kind}`" role="status">
    <p class="result__state">
      <span class="result__icon" aria-hidden="true">{{ icon }}</span>
      {{ title }}
    </p>
    <p class="result__points tabular">{{ format(sk.play.pointsGained, { points: formatDelta(result.points) }) }}</p>

    <dl v-if="fields.length > 0" class="result__fields">
      <div v-for="f in fields" :key="f.key" class="result__field">
        <dt class="result__label">{{ f.label }}</dt>
        <dd class="result__own">
          <span>{{ f.own || sk.play.noAnswer }}</span>
          <span class="result__mark" :aria-label="f.match ? sk.play.fieldMatchLabel : sk.play.fieldNoMatchLabel" role="img">
            {{ f.match ? sk.play.fieldMatch : sk.play.fieldNoMatch }}
          </span>
        </dd>
        <dd class="result__correct">
          <span class="result__correct-label">{{ sk.play.correctAnswers }}</span>
          {{ f.correct }}
        </dd>
      </div>
    </dl>

    <p class="result__score tabular">
      {{ format(sk.play.scoreRank, { score: formatScore(result.totalScore), rank: result.rank }) }}
    </p>
  </section>
</template>

<style scoped>
.result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--s-4);
  flex: 1;
  margin: calc(-1 * var(--s-4));
  padding: var(--s-6) var(--s-4);
  border-radius: var(--radius-lg);
  color: var(--primary-contrast);
  text-align: center;
  animation: pop var(--t-slow) var(--ease) both;
}

.result--correct {
  background: var(--success);
}

.result--partial {
  background: var(--warning);
  color: var(--qr-text);
}

.result--wrong {
  background: var(--danger);
}

.result__state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-2);
  font-size: var(--fs-player-question);
  font-weight: var(--fw-black);
}

.result__icon {
  display: inline-grid;
  place-items: center;
  width: var(--result-icon);
  height: var(--result-icon);
  border-radius: 50%;
  background: var(--overlay);
  color: var(--primary-contrast);
  font-size: var(--fs-player-pin);
}

.result__points {
  font-size: var(--fs-player-pin);
  font-weight: var(--fw-black);
}

.result__fields {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  width: 100%;
  margin: 0;
  padding: var(--s-3) var(--s-4);
  border-radius: var(--radius);
  background: var(--overlay);
  color: var(--primary-contrast);
  text-align: left;
}

.result__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.result__own {
  display: flex;
  justify-content: space-between;
  gap: var(--s-3);
  margin: 0;
  font-weight: var(--fw-semibold);
  overflow-wrap: anywhere;
}

.result__mark {
  font-weight: var(--fw-black);
}

.result__correct {
  margin: 0;
  overflow-wrap: anywhere;
}

.result__correct-label {
  font-weight: var(--fw-semibold);
}

.result__score {
  font-weight: var(--fw-bold);
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(calc(1 - 0.1 * var(--motion)));
  }
}
</style>
