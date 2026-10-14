<script setup lang="ts">
import type { Avatar } from "@nexquiz/shared";
import { computed } from "vue";

/**
 * Player avatar: own simple SVG shapes (body, head with hair, optional
 * glasses / hat / mustache). Decorative – the nickname next to it carries
 * the information. Size comes from `--avatar-size` of the parent.
 */
const props = defineProps<{ avatar: Avatar }>();

/** Skin and hair color of each head variant (tokens `--avatar-skin-n`, `--avatar-hair-n`). */
const HEADS = [
  { skin: 1, hair: 1 },
  { skin: 2, hair: 4 },
  { skin: 4, hair: 2 },
  { skin: 5, hair: 2 },
  { skin: 3, hair: 3 },
] as const;

/** Shirt color of each body variant (option palette). */
const BODY_COLORS = [2, 1, 5, 4, 6] as const;

const head = computed(() => HEADS[props.avatar.head] ?? HEADS[0]);
const style = computed(() => ({
  "--skin": `var(--avatar-skin-${head.value.skin})`,
  "--hair": `var(--avatar-hair-${head.value.hair})`,
  "--shirt": `var(--opt-${BODY_COLORS[props.avatar.body] ?? BODY_COLORS[0]})`,
}));

const TORSO = "M14 64 V54 Q14 44 24 44 H40 Q50 44 50 54 V64 Z";
</script>

<template>
  <svg class="avatar" viewBox="0 0 64 64" :style="style" aria-hidden="true" focusable="false">
    <!-- hair behind the face: afro, long hair -->
    <g v-if="avatar.head === 2" class="avatar__hair">
      <circle cx="19" cy="25" r="6" />
      <circle cx="22" cy="17" r="6" />
      <circle cx="29" cy="13" r="6" />
      <circle cx="36" cy="13" r="6" />
      <circle cx="42" cy="17" r="6" />
      <circle cx="45" cy="25" r="6" />
    </g>
    <path v-else-if="avatar.head === 4" class="avatar__hair" d="M16 30 Q16 13 32 13 Q48 13 48 30 V47 H16 Z" />

    <!-- body -->
    <path v-if="avatar.body === 1" class="avatar__shirt" d="M8 64 V54 L18 46 Q21 44 25 44 H39 Q43 44 46 46 L56 54 V64 Z" />
    <path v-else-if="avatar.body === 2" class="avatar__shirt" d="M24 44 H40 L52 64 H12 Z" />
    <path v-else class="avatar__shirt" :d="TORSO" />
    <path v-if="avatar.body === 1" class="avatar__light" d="M27 44 L32 50 L37 44 Z" />
    <template v-else-if="avatar.body === 3">
      <path class="avatar__ink-line" d="M28 46 V54 M36 46 V54" />
      <rect class="avatar__shade" x="24" y="56" width="16" height="6" rx="2" />
    </template>
    <template v-else-if="avatar.body === 4">
      <rect class="avatar__light" x="14" y="51" width="36" height="3" />
      <rect class="avatar__light" x="14" y="58" width="36" height="3" />
    </template>

    <!-- head -->
    <rect v-if="avatar.head === 3" class="avatar__skin" x="18" y="16" width="28" height="28" rx="11" />
    <circle v-else class="avatar__skin" cx="32" cy="30" r="14" />

    <!-- hair in front: short, spiky, bun -->
    <path v-if="avatar.head === 0" class="avatar__hair" d="M18 28 Q18 14 32 14 Q46 14 46 28 Q42 20 32 20 Q22 20 18 28 Z" />
    <path
      v-else-if="avatar.head === 1"
      class="avatar__hair"
      d="M18 27 L19 17 L24 20 L28 13 L32 19 L37 13 L40 20 L45 16 L46 27 Q39 20 32 20 Q25 20 18 27 Z"
    />
    <template v-else-if="avatar.head === 3">
      <circle class="avatar__hair" cx="32" cy="11" r="5" />
      <path class="avatar__hair" d="M18 27 Q18 16 32 16 Q46 16 46 27 Q40 21 32 21 Q24 21 18 27 Z" />
    </template>
    <path v-else-if="avatar.head === 4" class="avatar__hair" d="M18 26 Q20 15 32 15 Q44 15 46 26 Q38 22 32 18 Q26 22 18 26 Z" />

    <!-- face -->
    <circle class="avatar__ink" cx="26.5" cy="29" r="1.8" />
    <circle class="avatar__ink" cx="37.5" cy="29" r="1.8" />
    <path class="avatar__mouth" d="M28 37.5 Q32 40.5 36 37.5" />

    <!-- mustache -->
    <path
      v-if="avatar.mustache === 0"
      class="avatar__hair"
      d="M32 33 Q27 31 23 34 Q21 36 19 34 Q21 38 26 36 Q30 35 32 34.5 Q34 35 38 36 Q43 38 45 34 Q43 36 41 34 Q37 31 32 33 Z"
    />
    <path
      v-else-if="avatar.mustache === 1"
      class="avatar__hair"
      d="M24 35.5 Q24 32 32 32.5 Q40 32 40 35.5 Q36 37 32 35.5 Q28 37 24 35.5 Z"
    />
    <rect v-else-if="avatar.mustache === 2" class="avatar__hair" x="26" y="33" width="12" height="1.8" rx="0.9" />

    <!-- glasses -->
    <g v-if="avatar.glasses === 0" class="avatar__frame">
      <circle cx="26.5" cy="29" r="4.5" />
      <circle cx="37.5" cy="29" r="4.5" />
      <path d="M31 29 H33" />
    </g>
    <g v-else-if="avatar.glasses === 1" class="avatar__frame">
      <rect x="21" y="25.5" width="11" height="7" rx="1.5" />
      <rect x="32" y="25.5" width="11" height="7" rx="1.5" />
    </g>
    <g v-else-if="avatar.glasses === 2" class="avatar__shades">
      <rect x="20.5" y="26" width="11" height="6.5" rx="3" />
      <rect x="32.5" y="26" width="11" height="6.5" rx="3" />
      <path class="avatar__frame" d="M31 28 H33" />
    </g>

    <!-- hat -->
    <g v-if="avatar.hat === 0">
      <rect class="avatar__ink" x="21" y="1" width="22" height="15" rx="1.5" />
      <rect class="avatar__band" x="21" y="11" width="22" height="3" />
      <rect class="avatar__ink" x="13" y="14" width="38" height="3.5" rx="1.75" />
    </g>
    <g v-else-if="avatar.hat === 1" class="avatar__cap">
      <path d="M17 21 Q17 7 32 7 Q47 7 47 21 Z" />
      <path d="M30 19 H53 Q53 23 47 23 H30 Z" />
      <circle class="avatar__light" cx="32" cy="7" r="1.8" />
    </g>
    <g v-else-if="avatar.hat === 2">
      <path class="avatar__crown" d="M18 19 V6 L24 12 L32 3 L40 12 L46 6 V19 Z" />
      <circle class="avatar__band" cx="32" cy="14" r="2" />
    </g>
  </svg>
</template>

<style scoped>
.avatar {
  display: block;
  flex: none;
  width: var(--avatar-size, var(--avatar-sm));
  height: var(--avatar-size, var(--avatar-sm));
  border-radius: 50%;
  background: var(--avatar-bg);
  overflow: hidden;
}

.avatar__skin {
  fill: var(--skin);
}

.avatar__hair {
  fill: var(--hair);
}

.avatar__shirt,
.avatar__cap {
  fill: var(--shirt);
}

.avatar__light {
  fill: var(--avatar-light);
}

.avatar__shade {
  fill: var(--avatar-ink);
  opacity: 0.2;
}

.avatar__ink,
.avatar__shades rect {
  fill: var(--avatar-ink);
}

.avatar__band {
  fill: var(--opt-1);
}

.avatar__crown {
  fill: var(--opt-3);
}

.avatar__mouth,
.avatar__frame,
.avatar__ink-line {
  fill: none;
  stroke: var(--avatar-ink);
  stroke-width: 1.6;
  stroke-linecap: round;
}

.avatar__ink-line {
  stroke: var(--avatar-light);
}
</style>
