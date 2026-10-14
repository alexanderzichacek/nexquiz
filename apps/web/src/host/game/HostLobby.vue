<script setup lang="ts">
import type { LobbyPlayer } from "@nexquiz/shared";
import { computed } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import PinDisplay from "@/components/PinDisplay.vue";
import { plural, sk } from "@/i18n/sk";
import PlayerChip from "./PlayerChip.vue";
import QrCard from "./QrCard.vue";

/**
 * Lobby: quiz title, join URL, big PIN, QR code, live players with Kick,
 * „Spustiť“. Fits the stage: many players scroll inside the chips area.
 */
const props = defineProps<{
  pin: string;
  quizTitle: string;
  players: readonly LobbyPlayer[];
  starting: boolean;
}>();
defineEmits<{ start: []; kick: [player: LobbyPlayer] }>();

/** `{host}/play` without the protocol, as on the wireframe (`quiz.domena.sk/play`). */
const shortUrl = computed(() => `${window.location.host}/play`);
const canStart = computed(() => props.players.length >= 1);
</script>

<template>
  <section class="lobby">
    <div class="lobby__join">
      <div class="lobby__info">
        <h1 class="lobby__title line-clamp">{{ quizTitle }}</h1>
        <p class="lobby__line">
          <span class="lobby__label">{{ sk.game.joinAt }}</span>
          <strong class="lobby__url">{{ shortUrl }}</strong>
        </p>
        <p class="lobby__line lobby__line--pin">
          <span class="lobby__label">{{ sk.game.pin }}</span>
          <PinDisplay :pin="pin" class="lobby__pin" />
        </p>
      </div>
      <QrCard :pin="pin" :short-url="shortUrl" class="lobby__qr" />
    </div>

    <div class="lobby__players">
      <div class="lobby__players-bar">
        <p class="lobby__count tabular" role="status">
          <span aria-hidden="true">{{ sk.game.playersIcon }} </span>{{ plural(players.length, sk.plural.players) }}
        </p>
        <BaseButton
          variant="primary"
          large
          class="lobby__start"
          :disabled="!canStart"
          :loading="starting"
          @click="$emit('start')"
        >
          {{ sk.game.start }}
        </BaseButton>
      </div>
      <p v-if="players.length === 0" class="lobby__waiting">{{ sk.game.waitingForPlayers }}</p>
      <TransitionGroup tag="ul" name="chip" class="lobby__chips">
        <li v-for="p in players" :key="p.id">
          <PlayerChip :player="p" kickable @kick="$emit('kick', p)" />
        </li>
      </TransitionGroup>
    </div>
  </section>
</template>

<style scoped>
.lobby {
  display: flex;
  flex-direction: column;
  gap: var(--stage-gap);
  flex: 1;
  min-height: 0;
}

.lobby__title {
  --lines: 2;
  font-size: var(--fs-host-question);
  font-weight: var(--fw-bold);
  line-height: 1.15;
  overflow-wrap: anywhere;
}

.lobby__join {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-6);
  flex: none;
  padding-bottom: var(--stage-gap);
  border-bottom: var(--border-w) solid var(--border);
}

.lobby__info {
  display: flex;
  flex-direction: column;
  gap: var(--stage-gap);
  min-width: 0;
}

.lobby__qr {
  flex: none;
}

.lobby__line {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: var(--s-4);
}

.lobby__label {
  font-size: var(--fs-host-body);
  color: var(--text-muted);
}

.lobby__url {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-bold);
  overflow-wrap: anywhere;
}

.lobby__pin {
  font-size: var(--fs-host-pin);
  line-height: 1;
}

.lobby__players {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
  flex: 1;
  min-height: 0;
}

.lobby__players-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-4);
  flex: none;
}

.lobby__count {
  font-size: var(--fs-host-option);
  font-weight: var(--fw-bold);
}

.lobby__waiting {
  color: var(--text-muted);
}

.lobby__chips {
  display: flex;
  flex-wrap: wrap;
  align-content: flex-start;
  gap: var(--s-3);
  margin: 0;
  /* room for focus rings inside the scroll box */
  padding: var(--s-1);
  list-style: none;
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.lobby__start {
  font-size: var(--fs-host-option);
  min-height: calc(var(--btn-h-player) * 1.2);
  padding: 0 var(--s-7);
}

.chip-enter-active {
  transition:
    transform var(--t) var(--ease),
    opacity var(--t) var(--ease);
}

.chip-leave-active {
  transition: opacity var(--t) var(--ease);
}

.chip-enter-from {
  opacity: 0;
  transform: scale(calc(1 - 0.4 * var(--motion)));
}

.chip-leave-to {
  opacity: 0;
}
</style>
