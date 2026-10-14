<script setup lang="ts">
import { LIMITS, numberDistance, type NumberGuess } from "@nexquiz/shared";
import { computed } from "vue";
import { format, sk } from "@/i18n/sk";
import { formatNumber } from "@/lib/number";

/** Reveal of a `number` question: the guesses grouped by value, the nearest to the correct number first. */
const props = defineProps<{ guesses: readonly NumberGuess[]; correct: number }>();

/** Rows fit the projector; the rest is summarised. */
const MAX_SHOWN = 10;
/** More rows than this are shown in two columns (read down, then across). */
const ONE_COLUMN_MAX = 5;

const shown = computed(() =>
  props.guesses.slice(0, MAX_SHOWN).map((g) => {
    // The distance is an exact count of the smallest unit; show it as a number again.
    const distance = numberDistance(g.value, props.correct) / 10 ** LIMITS.number.decimals;
    return {
      key: g.value,
      value: formatNumber(g.value),
      count: format(sk.game.numberGuessCount, { count: g.count }),
      hit: g.hit,
      off: distance === 0 ? null : format(sk.game.numberOff, { distance: formatNumber(distance) }),
    };
  }),
);
const columns = computed(() => (shown.value.length > ONE_COLUMN_MAX ? 2 : 1));
const hidden = computed(() => props.guesses.slice(MAX_SHOWN).reduce((sum, g) => sum + g.count, 0));
</script>

<template>
  <section v-if="guesses.length > 0" class="guesses" :aria-label="sk.game.numberGuesses">
    <h2 class="guesses__title">{{ sk.game.numberGuesses }}</h2>
    <ul
      class="guesses__list"
      :class="{ 'guesses__list--two': columns === 2 }"
      :style="{ '--rows': Math.ceil(shown.length / columns) }"
    >
      <li v-for="g in shown" :key="g.key" class="guess" :class="{ 'guess--hit': g.hit }">
        <span class="guess__mark" aria-hidden="true">{{ g.hit ? "✓" : "✗" }}</span>
        <strong class="guess__value tabular">{{ g.value }}</strong>
        <span v-if="g.off" class="guess__off tabular">{{ g.off }}</span>
        <span class="guess__count tabular">{{ g.count }}</span>
        <span class="guess__state">{{ g.hit ? sk.game.numberHit : sk.game.numberMiss }}</span>
      </li>
    </ul>
    <p v-if="hidden > 0" class="guesses__more">{{ format(sk.game.numberMore, { count: hidden }) }}</p>
  </section>
</template>

<style scoped>
/* the parent limits the height (flex + min-height: 0); the list then scrolls inside */
.guesses {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  width: min(100%, var(--stage-list-w));
  min-height: 0;
}

.guesses__title {
  font-size: var(--fs-host-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  text-align: center;
}

.guesses__list {
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(var(--rows), auto);
  gap: var(--s-2) var(--s-5);
  min-height: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.guesses__list--two {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.guess {
  display: grid;
  grid-template-columns: auto 1fr auto auto auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-1) var(--s-4);
  border-left: var(--ring-selected) solid var(--danger);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-size: var(--fs-host-body);
}

.guess--hit {
  border-left-color: var(--success);
}

.guess__mark {
  font-weight: var(--fw-black);
  color: var(--danger);
}

.guess--hit .guess__mark {
  color: var(--success);
}

.guess__off,
.guess__state {
  font-size: var(--fs-host-label);
  color: var(--text-muted);
}

.guess__count {
  font-weight: var(--fw-bold);
}

.guesses__more {
  text-align: center;
  color: var(--text-muted);
}
</style>
