<script setup lang="ts">
import {
  createGameResponseSchema,
  gameHistoryResponseSchema,
  quizDtoSchema,
  quizListResponseSchema,
  type GameHistoryItem,
  type QuizSummary,
} from "@nexquiz/shared";
import { onMounted, ref } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { z } from "zod";
import BaseButton from "@/components/BaseButton.vue";
import PinDisplay from "@/components/PinDisplay.vue";
import { format, plural, sk } from "@/i18n/sk";
import { apiRequest } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { formatAgo, formatShortDate } from "@/lib/time";
import { useConfirmStore } from "@/stores/confirm";
import { useToastStore } from "@/stores/toast";
import HostAdminLayout from "./HostAdminLayout.vue";
import QuizRowMenu from "./QuizRowMenu.vue";

const router = useRouter();
const toast = useToastStore();
const confirm = useConfirmStore();

const quizzes = ref<QuizSummary[] | null>(null);
const games = ref<GameHistoryItem[] | null>(null);
const loadFailed = ref(false);
const creating = ref(false);
/** Quiz id whose game is being created (spinner on its ▶ button). */
const starting = ref<string | null>(null);

async function load(): Promise<void> {
  loadFailed.value = false;
  try {
    const [q, g] = await Promise.all([
      apiRequest("/api/quizzes", quizListResponseSchema),
      apiRequest("/api/games", gameHistoryResponseSchema),
    ]);
    quizzes.value = [...q].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    games.value = [...g].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch {
    loadFailed.value = true;
  }
}

async function createQuiz(): Promise<void> {
  creating.value = true;
  try {
    const quiz = await apiRequest("/api/quizzes", quizDtoSchema, { method: "POST", body: {} });
    await router.push({ name: "host-editor", params: { id: quiz.id } });
  } catch (err) {
    toast.show(errorMessage(err, sk.host.quizCreateFailed), "error");
  } finally {
    creating.value = false;
  }
}

async function duplicateQuiz(quiz: QuizSummary): Promise<void> {
  try {
    await apiRequest(`/api/quizzes/${quiz.id}/duplicate`, quizDtoSchema, { method: "POST", body: {} });
    toast.show(sk.host.duplicated, "success");
    await load();
  } catch (err) {
    toast.show(errorMessage(err), "error");
  }
}

async function deleteQuiz(quiz: QuizSummary): Promise<void> {
  const ok = await confirm.ask({
    title: sk.host.deleteQuizTitle,
    message: format(sk.host.deleteQuizMessage, { title: quiz.title }),
    confirmLabel: sk.common.delete,
    cancelLabel: sk.common.cancel,
    danger: true,
  });
  if (!ok) return;
  try {
    await apiRequest(`/api/quizzes/${quiz.id}`, z.null(), { method: "DELETE" });
    toast.show(sk.host.deleted, "success");
    await load();
  } catch (err) {
    toast.show(errorMessage(err), "error");
  }
}

async function startGame(quiz: QuizSummary): Promise<void> {
  starting.value = quiz.id;
  try {
    const game = await apiRequest("/api/games", createGameResponseSchema, {
      method: "POST",
      body: { quizId: quiz.id },
    });
    await router.push({ name: "host-game", params: { pin: game.pin } });
  } catch (err) {
    toast.show(errorMessage(err, sk.host.gameCreateFailed), "error");
  } finally {
    starting.value = null;
  }
}

function statusLabel(game: GameHistoryItem): string | null {
  if (game.status === "lobby") return sk.host.statusLobby;
  if (game.status === "running") return sk.host.statusRunning;
  return null;
}

onMounted(load);
</script>

<template>
  <HostAdminLayout>
    <div class="page">
      <section class="block" aria-labelledby="quizzes-title">
        <div class="block__head">
          <h1 id="quizzes-title" class="block__title">{{ sk.host.quizzes }}</h1>
          <BaseButton variant="primary" :loading="creating" @click="createQuiz">{{ sk.host.newQuiz }}</BaseButton>
        </div>

        <p v-if="loadFailed" class="muted" role="alert">
          {{ sk.host.loadFailed }}
          <BaseButton variant="ghost" @click="load">{{ sk.common.retry }}</BaseButton>
        </p>
        <p v-else-if="quizzes === null" class="muted">{{ sk.common.loading }}</p>
        <p v-else-if="quizzes.length === 0" class="muted">{{ sk.host.noQuizzes }}</p>
        <ul v-else class="rows">
          <li v-for="quiz in quizzes" :key="quiz.id" class="row">
            <RouterLink :to="{ name: 'host-editor', params: { id: quiz.id } }" class="row__title">
              {{ quiz.title }}
            </RouterLink>
            <span class="row__meta tabular">{{ plural(quiz.questionCount, sk.plural.questions) }}</span>
            <span class="row__meta">{{ format(sk.host.updated, { ago: formatAgo(quiz.updatedAt) }) }}</span>
            <span class="row__actions">
              <BaseButton
                variant="primary"
                :disabled="quiz.questionCount === 0"
                :loading="starting === quiz.id"
                :title="quiz.questionCount === 0 ? sk.host.playDisabled : undefined"
                @click="startGame(quiz)"
              >
                {{ sk.host.play }}
              </BaseButton>
              <QuizRowMenu
                :label="format(sk.host.moreActions, { title: quiz.title })"
                @edit="router.push({ name: 'host-editor', params: { id: quiz.id } })"
                @duplicate="duplicateQuiz(quiz)"
                @delete="deleteQuiz(quiz)"
              />
            </span>
          </li>
        </ul>
      </section>

      <section class="block" aria-labelledby="history-title">
        <div class="block__head">
          <h2 id="history-title" class="block__title">{{ sk.host.gameHistory }}</h2>
        </div>
        <p v-if="games !== null && games.length === 0" class="muted">{{ sk.host.noGames }}</p>
        <ul v-else-if="games !== null" class="rows">
          <li v-for="game in games" :key="game.id" class="row">
            <span class="row__date tabular">{{ formatShortDate(game.finishedAt ?? game.createdAt) }}</span>
            <span class="row__title row__title--plain">{{ game.quizTitle }}</span>
            <span class="row__meta tabular">{{ plural(game.playerCount, sk.plural.players) }}</span>
            <span class="row__meta">
              <template v-if="statusLabel(game)">
                <span class="badge">{{ statusLabel(game) }}</span>
                <PinDisplay :pin="game.pin" copyable />
              </template>
              <template v-else>
                {{ game.winner ? format(sk.host.winner, { name: game.winner }) : sk.host.noWinner }}
              </template>
            </span>
            <span class="row__actions">
              <RouterLink
                v-if="statusLabel(game)"
                class="link-btn"
                :to="{ name: 'host-game', params: { pin: game.pin } }"
              >
                {{ sk.host.openGame }}
              </RouterLink>
              <RouterLink class="link-btn" :to="{ name: 'host-results', params: { id: game.id } }">
                {{ sk.host.detail }}
              </RouterLink>
            </span>
          </li>
        </ul>
      </section>
    </div>
  </HostAdminLayout>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--s-6);
  max-width: var(--w-admin);
  margin: 0 auto;
}

.block {
  background: var(--surface);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.block__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-3);
  padding: var(--s-4) var(--s-5);
  border-bottom: var(--border-w) solid var(--border);
}

.block__title {
  font-size: var(--fs-editor-question);
  font-weight: var(--fw-semibold);
}

.block > .muted {
  padding: var(--s-4) var(--s-5);
}

.muted {
  color: var(--text-muted);
}

.rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-4);
  padding: var(--s-3) var(--s-5);
}

.row + .row {
  border-top: var(--border-w) solid var(--border);
}

.rows .row:has(.row__date) {
  grid-template-columns: auto minmax(0, 2fr) minmax(0, 1fr) minmax(0, 1.5fr) auto;
}

.row__title {
  font-weight: var(--fw-semibold);
  color: var(--text);
  text-decoration: none;
  overflow-wrap: anywhere;
}

a.row__title:hover,
a.row__title:focus-visible {
  color: var(--primary);
  text-decoration: underline;
}

.row__meta,
.row__date {
  color: var(--text-muted);
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  flex-wrap: wrap;
}

.row__actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--s-2);
}

.badge {
  padding: var(--s-1) var(--s-2);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text);
  font-size: var(--fs-editor-label);
  font-weight: var(--fw-semibold);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  min-height: var(--btn-h);
  padding: 0 var(--s-3);
  border-radius: var(--radius);
  color: var(--primary);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}

.link-btn:hover,
.link-btn:focus-visible {
  background: var(--surface-2);
}

@media (max-width: 720px) {
  .row,
  .rows .row:has(.row__date) {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2) var(--s-4);
  }

  .row__title {
    flex-basis: 100%;
  }

  .row__actions {
    margin-left: auto;
  }
}
</style>
