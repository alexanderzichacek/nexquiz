<script setup lang="ts">
import { formatPin, gameResultsResponseSchema, type GameResultsResponse } from "@nexquiz/shared";
import { computed, onMounted, ref } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { format, plural, sk } from "@/i18n/sk";
import { ApiError, apiRequest } from "@/lib/api";
import { formatShortDate } from "@/lib/time";
import HostAdminLayout from "./HostAdminLayout.vue";

const route = useRoute();
const gameId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));

const results = ref<GameResultsResponse | null>(null);
const error = ref<string | null>(null);

const csvUrl = computed(() => `/api/games/${encodeURIComponent(gameId.value)}/results?format=csv`);

interface RankedRow {
  id: string;
  rank: number;
  nickname: string;
  score: number;
  perQuestion: (number | null)[];
}

const rows = computed<RankedRow[]>(() => {
  const r = results.value;
  if (!r) return [];
  const points = new Map<string, number>();
  for (const a of r.answers) points.set(`${a.playerId}:${a.questionIndex}`, a.points);
  const sorted = [...r.players].sort(
    (a, b) => (a.finalRank ?? Number.MAX_SAFE_INTEGER) - (b.finalRank ?? Number.MAX_SAFE_INTEGER) || b.score - a.score,
  );
  return sorted.map((p, i) => ({
    id: p.id,
    rank: p.finalRank ?? i + 1,
    nickname: p.nickname,
    score: p.score,
    perQuestion: r.questions.map((q) => points.get(`${p.id}:${q.index}`) ?? null),
  }));
});

function score(value: number): string {
  return value.toFixed(2);
}

onMounted(async () => {
  try {
    results.value = await apiRequest(`/api/games/${encodeURIComponent(gameId.value)}/results`, gameResultsResponseSchema);
  } catch (err) {
    error.value = err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "INVALID") ? sk.results.notFound : sk.host.loadFailed;
  }
});
</script>

<template>
  <HostAdminLayout>
    <div class="page">
      <RouterLink :to="{ name: 'host-quizzes' }" class="back">{{ sk.results.backToList }}</RouterLink>

      <p v-if="error" class="muted" role="alert">{{ error }}</p>
      <p v-else-if="!results" class="muted">{{ sk.common.loading }}</p>
      <template v-else>
        <header class="head">
          <div>
            <h1 class="head__title">{{ results.game.quizTitle }}</h1>
            <p class="muted tabular">
              {{ formatShortDate(results.game.finishedAt ?? results.game.createdAt) }} ·
              {{ format(sk.results.pin, { pin: formatPin(results.game.pin) }) }} ·
              {{ plural(results.game.playerCount, sk.plural.players) }}
            </p>
          </div>
          <a class="export" :href="csvUrl" download>{{ sk.results.exportCsv }}</a>
        </header>

        <p v-if="rows.length === 0" class="muted">{{ sk.results.noPlayers }}</p>
        <div v-else class="table-wrap">
          <table class="table tabular">
            <thead>
              <tr>
                <th scope="col">{{ sk.results.rank }}</th>
                <th scope="col">{{ sk.results.nickname }}</th>
                <th scope="col" class="num">{{ sk.results.score }}</th>
                <th
                  v-for="q in results.questions"
                  :key="q.index"
                  scope="col"
                  class="num"
                  :title="format(sk.results.questionTitle, { n: q.index + 1, prompt: q.prompt })"
                >
                  {{ format(sk.results.question, { n: q.index + 1 }) }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.id">
                <td>{{ row.rank }}.</td>
                <th scope="row" class="nick">{{ row.nickname }}</th>
                <td class="num strong">{{ score(row.score) }}</td>
                <td v-for="(p, i) in row.perQuestion" :key="i" class="num">{{ p === null ? "–" : score(p) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
    </div>
  </HostAdminLayout>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  max-width: var(--w-admin);
  margin: 0 auto;
}

.back {
  align-self: flex-start;
  color: var(--primary);
  text-decoration: none;
}

.back:hover,
.back:focus-visible {
  text-decoration: underline;
}

.head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--s-3);
}

.head__title {
  font-size: var(--fs-editor-question);
  font-weight: var(--fw-semibold);
}

.muted {
  color: var(--text-muted);
}

.export {
  display: inline-flex;
  align-items: center;
  min-height: var(--btn-h);
  padding: 0 var(--s-5);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  background: var(--surface-2);
  color: var(--text);
  font-weight: var(--fw-semibold);
  text-decoration: none;
}

.export:hover,
.export:focus-visible {
  border-color: var(--primary);
}

.table-wrap {
  overflow-x: auto;
  background: var(--surface);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
}

.table {
  width: 100%;
  border-collapse: collapse;
}

.table th,
.table td {
  padding: var(--s-2) var(--s-4);
  text-align: left;
  white-space: nowrap;
}

.table thead th {
  font-size: var(--fs-editor-label);
  font-weight: var(--fw-semibold);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  border-bottom: var(--border-w) solid var(--border);
}

.table tbody tr + tr {
  border-top: var(--border-w) solid var(--border);
}

.table .nick {
  font-weight: var(--fw-semibold);
}

.table .num {
  text-align: right;
}

.table .strong {
  font-weight: var(--fw-bold);
}
</style>
