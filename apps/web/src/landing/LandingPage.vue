<script setup lang="ts">
import { gameExistsResponseSchema, loginResponseSchema, normalizePinInput, PIN_LENGTH } from "@nexquiz/shared";
import { computed, onMounted, ref, useTemplateRef } from "vue";
import { useRouter } from "vue-router";
import AppFooter from "@/components/AppFooter.vue";
import AppHeader from "@/components/AppHeader.vue";
import BaseButton from "@/components/BaseButton.vue";
import { sk } from "@/i18n/sk";
import { ApiError, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/stores/auth";

const router = useRouter();
const auth = useAuthStore();

// --- Join -------------------------------------------------------------------
const pinInput = ref("");
const pinError = ref<string | null>(null);
const joining = ref(false);
const pinEl = useTemplateRef<HTMLInputElement>("pinEl");

const pinDigits = computed(() => normalizePinInput(pinInput.value).replace(/\D/g, "").slice(0, PIN_LENGTH));
const canJoin = computed(() => pinDigits.value.length === PIN_LENGTH && !joining.value);

function onPinInput(event: Event): void {
  const target = event.target as HTMLInputElement;
  const digits = target.value.replace(/\D/g, "").slice(0, PIN_LENGTH);
  // Auto-format as `123 456`.
  pinInput.value = digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
  target.value = pinInput.value;
  pinError.value = null;
}

async function join(): Promise<void> {
  if (!canJoin.value) return;
  joining.value = true;
  pinError.value = null;
  try {
    const res = await apiRequest(`/api/games/${pinDigits.value}/exists`, gameExistsResponseSchema);
    if (res.exists) {
      await router.push({ name: "play", query: { pin: pinDigits.value } });
    } else {
      pinError.value = sk.errors.pinNotFound;
    }
  } catch (err) {
    pinError.value = err instanceof ApiError && err.code === "RATE_LIMITED" ? sk.errors.rateLimited : sk.errors.pinNotFound;
  } finally {
    joining.value = false;
  }
}

// --- Login ------------------------------------------------------------------
const password = ref("");
const loginError = ref<string | null>(null);
const loggingIn = ref(false);

async function login(): Promise<void> {
  if (!password.value || loggingIn.value) return;
  loggingIn.value = true;
  loginError.value = null;
  try {
    await apiRequest("/api/auth/login", loginResponseSchema, { method: "POST", body: { password: password.value } });
    auth.setAuthenticated(true);
    await router.push({ name: "host-quizzes" });
  } catch (err) {
    if (err instanceof ApiError && err.code === "RATE_LIMITED") loginError.value = sk.errors.rateLimited;
    else if (err instanceof ApiError && (err.code === "WRONG_PASSWORD" || err.status === 401))
      loginError.value = sk.errors.wrongPassword;
    else loginError.value = sk.errors.generic;
  } finally {
    loggingIn.value = false;
  }
}

onMounted(() => {
  void auth.refresh();
  // Autofocus only on desktop (fine pointer) so mobile keyboards do not pop up.
  if (window.matchMedia("(pointer: fine)").matches) pinEl.value?.focus();
});
</script>

<template>
  <div class="landing">
    <AppHeader home-to="/" />

    <main class="landing__main">
      <p class="landing__claim">{{ sk.landing.claim }}</p>

      <div class="landing__cards">
        <section class="card card--primary" aria-labelledby="join-title">
          <h1 id="join-title" class="card__title">{{ sk.landing.joinTitle }}</h1>
          <form class="card__form" novalidate @submit.prevent="join">
            <label class="field">
              <span class="field__label">{{ sk.landing.pinLabel }}</span>
              <input
                ref="pinEl"
                :value="pinInput"
                class="field__input field__input--pin tabular"
                :class="{ 'field__input--error': pinError }"
                inputmode="numeric"
                autocomplete="off"
                :placeholder="sk.landing.pinPlaceholder"
                :aria-invalid="pinError !== null"
                aria-describedby="pin-error"
                maxlength="7"
                @input="onPinInput"
              />
            </label>
            <p v-if="pinError" id="pin-error" class="field__error" role="alert">{{ pinError }}</p>
            <BaseButton type="submit" variant="primary" block large :disabled="!canJoin" :loading="joining">
              {{ sk.landing.join }}
            </BaseButton>
          </form>
        </section>

        <section class="card" aria-labelledby="login-title">
          <h2 id="login-title" class="card__title">{{ sk.landing.loginTitle }}</h2>
          <div v-if="auth.authenticated" class="card__form">
            <p class="card__note">{{ sk.landing.loggedIn }}</p>
            <BaseButton variant="secondary" block large @click="router.push({ name: 'host-quizzes' })">
              {{ sk.landing.continueToHost }}
            </BaseButton>
          </div>
          <form v-else class="card__form" novalidate @submit.prevent="login">
            <label class="field">
              <span class="field__label">{{ sk.landing.passwordLabel }}</span>
              <input
                v-model="password"
                type="password"
                class="field__input"
                :class="{ 'field__input--error': loginError }"
                autocomplete="current-password"
                :aria-invalid="loginError !== null"
                aria-describedby="login-error"
                @input="loginError = null"
              />
            </label>
            <p v-if="loginError" id="login-error" class="field__error" role="alert">{{ loginError }}</p>
            <BaseButton type="submit" variant="secondary" block large :disabled="!password" :loading="loggingIn">
              {{ sk.landing.login }}
            </BaseButton>
          </form>
        </section>
      </div>
    </main>

    <AppFooter />
  </div>
</template>

<style scoped>
.landing {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.landing__main {
  flex: 1;
  width: 100%;
  max-width: var(--w-landing);
  margin: 0 auto;
  padding: var(--s-5) var(--s-4) var(--s-7);
  padding-left: max(var(--s-4), env(safe-area-inset-left));
  padding-right: max(var(--s-4), env(safe-area-inset-right));
}

.landing__claim {
  font-size: var(--fs-claim);
  font-weight: var(--fw-semibold);
  color: var(--text-muted);
  margin-bottom: var(--s-6);
}

.landing__cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--s-5);
}

@media (min-width: 720px) {
  .landing__claim {
    text-align: center;
    margin: var(--s-6) 0 var(--s-7);
  }

  .landing__cards {
    grid-template-columns: 1fr 1fr;
  }
}

.card {
  background: var(--surface);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: var(--s-5);
}

.card--primary {
  border-color: var(--primary);
  box-shadow: var(--shadow-lg);
}

.card__title {
  font-size: var(--fs-player-question);
  font-weight: var(--fw-bold);
  margin-bottom: var(--s-4);
}

.card__form {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.card__note {
  color: var(--text-muted);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.field__label {
  font-size: var(--fs-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.field__input {
  min-height: var(--input-h);
  padding: 0 var(--s-4);
  background: var(--bg);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
}

.field__input--pin {
  font-family: var(--font-mono);
  font-size: var(--fs-pin-input);
  letter-spacing: 0.1em;
}

.field__input--error {
  border-color: var(--danger);
}

.field__error {
  color: var(--danger);
  font-size: var(--fs-small);
}
</style>
