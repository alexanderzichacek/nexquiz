<script setup lang="ts">
import type { LobbyPlayer } from "@nexquiz/shared";
import { computed } from "vue";
import { nicknameColor } from "@/components/options";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import { format, sk } from "@/i18n/sk";

/** Avatar + nickname „pill“ with a color from the name hash; a disconnected player is dimmed. */
const props = withDefaults(defineProps<{ player: LobbyPlayer; kickable?: boolean }>(), { kickable: false });
defineEmits<{ kick: [] }>();

const color = computed(() => nicknameColor(props.player.nickname));
</script>

<template>
  <span class="chip" :class="{ 'chip--offline': !player.connected }" :style="{ '--chip-color': color }">
    <PlayerAvatar :avatar="player.avatar" class="chip__avatar" />
    <span class="chip__name">{{ player.nickname }}</span>
    <button
      v-if="kickable"
      type="button"
      class="chip__kick"
      :aria-label="format(sk.game.kick, { nickname: player.nickname })"
      :title="format(sk.game.kick, { nickname: player.nickname })"
      @click="$emit('kick')"
    >
      ×
    </button>
  </span>
</template>

<style scoped>
.chip {
  display: inline-flex;
  align-items: center;
  gap: var(--s-1);
  min-height: var(--tap-min);
  padding: 0 var(--s-2) 0 var(--s-1);
  border-radius: 999px;
  background: var(--chip-color);
  color: var(--on-option);
  font-size: var(--fs-host-body);
  font-weight: var(--fw-bold);
  box-shadow: var(--shadow);
  transition: opacity var(--t) var(--ease);
}

.chip__avatar {
  --avatar-size: var(--avatar-chip);
  --avatar-bg: var(--avatar-light);
}

.chip--offline {
  opacity: var(--opacity-offline);
}

.chip__name {
  max-width: var(--chip-name-max);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 0 var(--s-2) 0 var(--s-1);
}

.chip__kick {
  display: inline-grid;
  place-items: center;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  margin: calc(-1 * var(--s-1)) 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  font-size: var(--fs-host-body);
  cursor: pointer;
  opacity: 0.75;
}

.chip__kick:hover,
.chip__kick:focus-visible {
  opacity: 1;
  background: var(--overlay);
}
</style>
