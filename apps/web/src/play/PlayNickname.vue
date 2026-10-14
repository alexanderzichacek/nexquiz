<script setup lang="ts">
import { formatPin, NICKNAME_MAX, nicknameSchema, type Avatar } from "@nexquiz/shared";
import { computed, ref } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import { format, sk } from "@/i18n/sk";
import { randomAvatar } from "@/lib/avatar";
import AvatarPicker from "./AvatarPicker.vue";
import MediaToggle from "./MediaToggle.vue";
import type { JoinError } from "./usePlayGame";

/**
 * Nickname step: avatar (random start, the player may change it), a
 * nickname of 1–20 characters, unique in the game (the server answers
 * `NICK_TAKEN`), and the opt-in sound and video on this device.
 */
const props = defineProps<{ pin: string; join: (nickname: string, avatar: Avatar) => Promise<JoinError | null> }>();

const nickname = ref("");
const avatar = ref<Avatar>(randomAvatar());
const error = ref<string | null>(null);
const joining = ref(false);

const valid = computed(() => nicknameSchema.safeParse(nickname.value).success);

const MESSAGES: Record<JoinError, string> = {
  NICK_TAKEN: sk.errors.nickTaken,
  GAME_FINISHED: sk.errors.gameFinished,
  RATE_LIMITED: sk.errors.rateLimited,
  INVALID: sk.play.nicknameInvalid,
  NETWORK: sk.errors.generic,
};

async function submit(): Promise<void> {
  if (!valid.value || joining.value) return;
  joining.value = true;
  error.value = null;
  try {
    const result = await props.join(nickname.value.trim(), avatar.value);
    if (result) error.value = MESSAGES[result];
  } finally {
    joining.value = false;
  }
}
</script>

<template>
  <form class="nick" novalidate @submit.prevent="submit">
    <p class="nick__pin tabular">{{ format(sk.play.pin, { pin: formatPin(pin) }) }}</p>
    <AvatarPicker v-model="avatar" />
    <label class="nick__field">
      <span class="nick__label">{{ sk.play.nicknameLabel }}</span>
      <input
        v-model="nickname"
        class="nick__input"
        :class="{ 'nick__input--error': error }"
        type="text"
        :maxlength="NICKNAME_MAX"
        :placeholder="sk.play.nicknamePlaceholder"
        autocomplete="nickname"
        autocapitalize="words"
        spellcheck="false"
        enterkeyhint="go"
        :aria-invalid="error ? true : undefined"
        aria-describedby="nick-error"
        @input="error = null"
      />
      <span id="nick-error" class="nick__error" role="alert">{{ error ?? "" }}</span>
    </label>
    <MediaToggle hint />
    <BaseButton type="submit" variant="primary" block large :disabled="!valid" :loading="joining">
      {{ sk.play.enter }}
    </BaseButton>
  </form>
</template>

<style scoped>
.nick {
  display: flex;
  flex-direction: column;
  gap: var(--s-5);
  flex: 1;
  justify-content: flex-end;
}

@media (min-width: 600px) {
  .nick {
    justify-content: center;
  }
}

.nick__pin {
  font-family: var(--font-mono);
  font-size: var(--fs-player-pin);
  font-weight: var(--fw-black);
  text-align: center;
  letter-spacing: 0.08em;
}

.nick__field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.nick__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.nick__input {
  width: 100%;
  min-height: var(--input-h);
  padding: 0 var(--s-4);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  font-size: var(--fs-player-option);
}

.nick__input--error {
  border-color: var(--danger);
}

.nick__error {
  min-height: calc(var(--fs-small) * 1.5);
  color: var(--danger);
  font-size: var(--fs-small);
}
</style>
