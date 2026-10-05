<script setup lang="ts">
import type { Option, VoteCount } from "@nexquiz/shared";
import { computed } from "vue";
import OptionShape from "@/components/OptionShape.vue";
import { optionColor, optionLetter } from "@/components/options";
import { plural, sk } from "@/i18n/sk";

/**
 * Reveal of `single` / `multi`: the tiles turn into a bar chart (height =
 * number of votes). Correct options keep full color with ✓ and bounce,
 * wrong ones are dimmed.
 */
const props = defineProps<{ options: readonly Option[]; votes: readonly VoteCount[]; correctIds: readonly string[] }>();

const max = computed(() => Math.max(1, ...props.votes.map((v) => v.count)));
const bars = computed(() =>
  props.options.map((o, i) => {
    const count = props.votes.find((v) => v.optionId === o.id)?.count ?? 0;
    return {
      option: o,
      index: i,
      count,
      height: count / max.value,
      correct: props.correctIds.includes(o.id),
    };
  }),
);
</script>

<template>
  <ul class="bars">
    <li
      v-for="b in bars"
      :key="b.option.id"
      class="bars__col"
      :class="b.correct ? 'bars__col--correct' : 'bars__col--wrong'"
      :style="{ '--tile-color': optionColor(b.index), '--h': b.height }"
    >
      <span class="bars__count tabular">{{ b.count }}</span>
      <span class="bars__track" aria-hidden="true"><span class="bars__bar"></span></span>
      <span class="bars__label">
        <OptionShape :index="b.index" class="bars__shape" />
        <span class="bars__letter">{{ optionLetter(b.index) }}</span>
        <span class="bars__text">{{ b.option.text }}</span>
        <span v-if="b.correct" class="bars__check" aria-hidden="true">✓</span>
      </span>
      <span class="visually-hidden">
        {{ plural(b.count, sk.plural.votes) }}, {{ b.correct ? sk.game.correctLabel : sk.game.wrongLabel }}
      </span>
    </li>
  </ul>
</template>

<style scoped>
.bars {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: var(--s-4);
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.bars__col {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--s-2);
  flex: 1;
  min-width: 0;
  max-width: var(--bar-col-max);
  transition: opacity var(--t-slow) var(--ease);
}

.bars__count {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-black);
  text-align: center;
}

.bars__track {
  display: flex;
  align-items: flex-end;
  height: var(--bar-chart-h);
}

.bars__bar {
  width: 100%;
  height: max(var(--s-2), calc(var(--h) * 100%));
  border-radius: var(--radius) var(--radius) 0 0;
  background: var(--tile-color);
  transform-origin: bottom;
  animation: grow var(--t-slow) var(--ease) both;
}

.bars__label {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: var(--s-2) var(--s-3);
  border-radius: var(--radius-sm);
  background: var(--tile-color);
  color: var(--on-option);
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
}

.bars__shape {
  width: 1.2em;
  height: 1.2em;
}

.bars__letter,
.bars__check {
  font-weight: var(--fw-black);
}

.bars__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bars__col--wrong {
  opacity: var(--opacity-muted);
}

.bars__col--correct {
  animation: bounce var(--t-slow) var(--ease) both;
  animation-delay: var(--t-slow);
}

@keyframes grow {
  from {
    transform: scaleY(calc(1 - var(--motion)));
  }
}

@keyframes bounce {
  40% {
    transform: translateY(calc(-1 * var(--s-4) * var(--motion)));
  }
}
</style>
