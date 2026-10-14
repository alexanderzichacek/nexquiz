<script setup lang="ts">
import { AVATAR_OPTIONAL_PARTS, AVATAR_PARTS, AVATAR_VARIANTS, type Avatar, type AvatarPart } from "@nexquiz/shared";
import { computed, ref } from "vue";
import PlayerAvatar from "@/components/PlayerAvatar.vue";
import { format, sk } from "@/i18n/sk";
import { randomAvatar } from "@/lib/avatar";

/**
 * Avatar picker of the nickname step: large preview, one tab per part and
 * the variants of the active part (each shown as the whole avatar with that
 * variant). Glasses, hat and mustache also have „Bez“.
 */
const avatar = defineModel<Avatar>({ required: true });

const active = ref<AvatarPart>("body");

const optional = (part: AvatarPart): boolean => (AVATAR_OPTIONAL_PARTS as readonly AvatarPart[]).includes(part);

const choices = computed(() => {
  const part = active.value;
  const variants: (number | null)[] = Array.from({ length: AVATAR_VARIANTS[part] }, (_, i) => i);
  if (optional(part)) variants.unshift(null);
  return variants.map((value) => ({
    value,
    preview: { ...avatar.value, [part]: value } as Avatar,
    label: value === null ? sk.avatar.none : format(sk.avatar.variant, { n: value + 1 }),
  }));
});

function choose(value: number | null): void {
  avatar.value = { ...avatar.value, [active.value]: value };
}

function shuffle(): void {
  avatar.value = randomAvatar();
}
</script>

<template>
  <fieldset class="picker">
    <legend class="picker__legend">{{ sk.avatar.title }}</legend>

    <div class="picker__top">
      <PlayerAvatar :avatar="avatar" class="picker__preview" />
      <button type="button" class="picker__random" @click="shuffle">{{ sk.avatar.random }}</button>
    </div>

    <div class="picker__tabs" role="group" :aria-label="sk.avatar.title">
      <button
        v-for="part in AVATAR_PARTS"
        :key="part"
        type="button"
        class="picker__tab"
        :class="{ 'picker__tab--active': part === active }"
        :aria-pressed="part === active"
        @click="active = part"
      >
        {{ sk.avatar.parts[part] }}
      </button>
    </div>

    <div class="picker__choices" role="radiogroup" :aria-label="sk.avatar.parts[active]">
      <button
        v-for="c in choices"
        :key="String(c.value)"
        type="button"
        role="radio"
        class="picker__choice"
        :class="{ 'picker__choice--selected': avatar[active] === c.value }"
        :aria-checked="avatar[active] === c.value"
        :aria-label="c.label"
        :title="c.label"
        @click="choose(c.value)"
      >
        <span v-if="c.value === null" class="picker__none" aria-hidden="true">{{ sk.avatar.none }}</span>
        <PlayerAvatar v-else :avatar="c.preview" />
      </button>
    </div>
  </fieldset>
</template>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.picker__legend {
  margin-bottom: var(--s-2);
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.picker__top {
  position: relative;
  display: flex;
  justify-content: center;
  width: 100%;
}

.picker__preview {
  --avatar-size: var(--avatar-preview);
}

.picker__random {
  position: absolute;
  right: 0;
  bottom: 0;
  min-height: var(--tap-min);
  padding: 0 var(--s-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text);
  font-size: var(--fs-small);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}

.picker__tabs {
  display: flex;
  gap: var(--s-1);
  width: 100%;
  overflow-x: auto;
  scrollbar-width: none;
}

.picker__tab {
  flex: 1 0 auto;
  min-height: var(--tap-min);
  padding: 0 var(--s-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  color: var(--text-muted);
  font-size: var(--fs-small);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}

.picker__tab--active {
  border-color: var(--primary);
  background: var(--primary);
  color: var(--primary-contrast);
}

.picker__choices {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s-2);
}

.picker__choice {
  --avatar-size: var(--avatar-pick);
  display: grid;
  place-items: center;
  min-width: var(--tap-min);
  min-height: var(--tap-min);
  padding: var(--s-1);
  border: var(--ring-selected) solid transparent;
  border-radius: 50%;
  background: transparent;
  cursor: pointer;
}

.picker__choice--selected {
  border-color: var(--primary);
}

.picker__none {
  display: grid;
  place-items: center;
  width: var(--avatar-pick);
  height: var(--avatar-pick);
  border: var(--border-w) dashed var(--border);
  border-radius: 50%;
  color: var(--text-muted);
  font-size: var(--fs-small);
  font-weight: var(--fw-semibold);
}
</style>
