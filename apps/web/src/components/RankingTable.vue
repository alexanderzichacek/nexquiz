<script setup lang="ts">
import type { RankingEntry } from "@nexquiz/shared";
import { onMounted, ref, useId } from "vue";
import { sk } from "@/i18n/sk";
import { formatScore } from "@/lib/format";
import PlayerAvatar from "./PlayerAvatar.vue";

/**
 * Final ranking below / next to the podium (4th place onward): rank, avatar,
 * nickname and score. The list scrolls inside its own area, so the screen
 * around it stays put. `multiColumn` flows the rows into 2 columns (4.–14. |
 * 15.–25.) when the area is wide enough (host projector). The own row on the
 * player's screen is bold, outlined and has the „Ty“ label, not only a color.
 */
const props = withDefaults(
  defineProps<{
    entries: readonly RankingEntry[];
    title: string;
    size?: "host" | "player";
    highlightId?: string | null;
    multiColumn?: boolean;
  }>(),
  { size: "player", highlightId: null, multiColumn: false },
);

const titleId = useId();
const scroller = ref<HTMLElement | null>(null);

// With a long list, center the own row inside the list area (never scrolls the page).
onMounted(() => {
  const el = scroller.value;
  const own = el?.querySelector<HTMLElement>(".ranking__row--own");
  if (!el || !own || el.scrollHeight <= el.clientHeight) return;
  el.scrollTop = own.offsetTop - (el.clientHeight - own.offsetHeight) / 2;
});

function isOwn(entry: RankingEntry): boolean {
  return props.highlightId !== null && entry.playerId === props.highlightId;
}
</script>

<template>
  <div class="ranking" :class="`ranking--${size}`">
    <h2 :id="titleId" class="ranking__title">{{ title }}</h2>
    <!-- focusable so the list can be scrolled from the keyboard -->
    <div ref="scroller" class="ranking__scroll" role="region" tabindex="0" :aria-labelledby="titleId">
      <ol class="ranking__list" :class="{ 'ranking__list--multi': multiColumn }">
        <li
          v-for="entry in entries"
          :key="entry.playerId"
          class="ranking__row"
          :class="{ 'ranking__row--own': isOwn(entry) }"
          :aria-current="isOwn(entry) ? 'true' : undefined"
        >
          <span class="ranking__rank tabular">{{ entry.rank }}.</span>
          <PlayerAvatar :avatar="entry.avatar" class="ranking__avatar" />
          <span class="ranking__name">{{ entry.nickname }}</span>
          <span v-if="isOwn(entry)" class="ranking__you">{{ sk.play.you }}</span>
          <span class="ranking__score tabular">{{ formatScore(entry.score) }}</span>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.ranking {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
  min-height: 0;
  text-align: left;
}

.ranking__title {
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.ranking__scroll {
  position: relative; /* offsetParent for centering the own row */
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-radius: var(--radius-sm);
}

.ranking__list {
  display: flex;
  flex-direction: column;
  gap: var(--s-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

/* column-major flow: 2 columns only when each is at least --ranking-col-min wide */
.ranking__list--multi {
  display: block;
  columns: var(--ranking-col-min) 2;
  column-gap: var(--s-5);
}

.ranking__list--multi .ranking__row {
  break-inside: avoid;
  margin-bottom: var(--s-1);
}

.ranking__row {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  border: var(--border-w) solid transparent;
  border-radius: var(--radius-sm);
  background: var(--surface);
}

.ranking__row--own {
  background: var(--surface-2);
  border-color: var(--primary);
  box-shadow: inset 0 0 0 var(--border-w) var(--primary);
}

.ranking__rank {
  min-width: var(--rank-col);
  font-weight: var(--fw-black);
  color: var(--text-muted);
}

.ranking__avatar {
  --avatar-size: var(--avatar-row);
  flex: none;
}

.ranking__name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: var(--fw-semibold);
}

.ranking__row--own .ranking__name,
.ranking__row--own .ranking__rank {
  font-weight: var(--fw-black);
  color: var(--text);
}

.ranking__you {
  flex: none;
  padding: 0 var(--s-2);
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: var(--primary-contrast);
  font-size: var(--fs-small);
  font-weight: var(--fw-bold);
}

.ranking__score {
  font-weight: var(--fw-bold);
}

/* host: projector sizes, fills the height it gets */
.ranking--host {
  flex: 1;
  font-size: var(--fs-host-body);
}

.ranking--host .ranking__title {
  font-size: var(--fs-host-label);
}

.ranking--host .ranking__scroll {
  flex: 1;
}

.ranking--host .ranking__row {
  padding: var(--s-1) var(--s-3);
}

/* player: phone sizes, bounded height */
.ranking--player {
  font-size: var(--fs-body);
}

.ranking--player .ranking__title {
  font-size: var(--fs-label);
}

.ranking--player .ranking__scroll {
  max-height: var(--player-ranking-h);
}

.ranking--player .ranking__row {
  padding: var(--s-2) var(--s-3);
}
</style>
