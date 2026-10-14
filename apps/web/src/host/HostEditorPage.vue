<script setup lang="ts">
import { createGameResponseSchema, isPage, LIMITS } from "@nexquiz/shared";
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from "vue-router";
import { sk } from "@/i18n/sk";
import { apiRequest } from "@/lib/api";
import { errorMessage } from "@/lib/errors";
import { useAuthStore } from "@/stores/auth";
import { useConfirmStore } from "@/stores/confirm";
import { useToastStore } from "@/stores/toast";
import "./editor/editor.css";
import FieldError from "./editor/FieldError.vue";
import PageEditor from "./editor/PageEditor.vue";
import QuestionEditor from "./editor/QuestionEditor.vue";
import QuestionList from "./editor/QuestionList.vue";
import SettingsPanel from "./editor/SettingsPanel.vue";
import { useQuizEditorStore } from "./editor/store";
import HostAdminLayout from "./HostAdminLayout.vue";

const route = useRoute();
const router = useRouter();
const editor = useQuizEditorStore();
const confirm = useConfirmStore();
const auth = useAuthStore();
const toast = useToastStore();

const starting = ref(false);
const quizId = computed(() => (typeof route.params.id === "string" ? route.params.id : ""));

watch(quizId, (id) => void editor.load(id), { immediate: true });

async function startGame(): Promise<void> {
  if (starting.value) return;
  starting.value = true;
  try {
    if (!(await editor.flush())) {
      toast.show(editor.status === "invalid" ? sk.editor.startBlockedInvalid : sk.editor.saveError, "error");
      return;
    }
    const game = await apiRequest("/api/games", createGameResponseSchema, {
      method: "POST",
      body: { quizId: quizId.value },
    });
    await router.push({ name: "host-game", params: { pin: game.pin } });
  } catch (err) {
    toast.show(errorMessage(err, sk.host.gameCreateFailed), "error");
  } finally {
    starting.value = false;
  }
}

onBeforeRouteLeave(async () => {
  // Expired session (401 handler) or logout: nothing can be saved any more.
  if (editor.loadState !== "ready" || auth.authenticated === false) return true;
  if (await editor.flush()) return true;
  return confirm.ask({
    title: sk.editor.leaveTitle,
    message: sk.editor.leaveMessage,
    confirmLabel: sk.editor.leaveConfirm,
    cancelLabel: sk.common.cancel,
    danger: true,
  });
});

function onBeforeUnload(event: BeforeUnloadEvent): void {
  if (!editor.isDirty()) return;
  void editor.save();
  event.preventDefault();
}

onMounted(() => window.addEventListener("beforeunload", onBeforeUnload));
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", onBeforeUnload);
  editor.reset();
});
</script>

<template>
  <HostAdminLayout>
    <div class="editor">
      <div class="editor__top">
        <RouterLink :to="{ name: 'host-quizzes' }" class="editor__back">{{ sk.editor.backToList }}</RouterLink>
        <div v-if="editor.draft" class="editor__title">
          <label class="visually-hidden" for="quiz-title">{{ sk.editor.quizTitleLabel }}</label>
          <input
            id="quiz-title"
            v-model="editor.draft.title"
            class="input editor__title-input"
            :class="{ 'input--error': editor.validation.quiz.title }"
            :maxlength="LIMITS.quizTitle.max"
            :placeholder="sk.editor.quizTitleLabel"
          />
          <FieldError :message="editor.validation.quiz.title ?? editor.validation.quiz.questions" />
        </div>
      </div>

      <p v-if="editor.loadState === 'loading'" class="hint">{{ sk.common.loading }}</p>
      <p v-else-if="editor.loadState === 'not-found'" class="hint" role="alert">{{ sk.host.loadFailed }}</p>
      <p v-else-if="editor.loadState === 'error'" class="hint" role="alert">
        {{ sk.host.loadFailed }}
        <button type="button" class="editor__retry" @click="editor.load(quizId)">{{ sk.common.retry }}</button>
      </p>

      <div v-else-if="editor.draft" class="editor__panels">
        <div class="panel panel--list">
          <QuestionList />
        </div>
        <div class="panel panel--main">
          <PageEditor
            v-if="editor.selected && isPage(editor.selected)"
            :key="editor.selected.id"
            :model-value="editor.selected"
            :index="editor.selectedIndex"
            :total="editor.questions.length"
          />
          <QuestionEditor
            v-else-if="editor.selectedQuestion"
            :key="editor.selectedQuestion.id"
            :model-value="editor.selectedQuestion"
            :index="editor.selectedNumber - 1"
            :total="editor.totalQuestions"
          />
          <p v-else class="hint">{{ sk.editor.noQuestions }}</p>
        </div>
        <div class="panel panel--settings">
          <SettingsPanel v-model:quiz="editor.draft" :question="editor.selectedQuestion" :starting="starting" @start="startGame" />
        </div>
      </div>
    </div>
  </HostAdminLayout>
</template>

<style scoped>
.editor {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
}

.editor__top {
  display: flex;
  align-items: flex-start;
  gap: var(--s-4);
}

.editor__back {
  min-height: var(--btn-h);
  display: inline-flex;
  align-items: center;
  color: var(--primary);
  text-decoration: none;
  white-space: nowrap;
}

.editor__back:hover,
.editor__back:focus-visible {
  text-decoration: underline;
}

.editor__title {
  flex: 1;
  min-width: 0;
}

.editor .editor__title-input {
  font-size: var(--fs-editor-question);
  font-weight: var(--fw-semibold);
}

.editor__retry {
  border: 0;
  background: transparent;
  color: var(--primary);
  text-decoration: underline;
  cursor: pointer;
}

.editor__panels {
  display: grid;
  grid-template-columns: var(--w-editor-list) minmax(0, 1fr) var(--w-editor-settings);
  grid-template-areas: "list main settings";
  gap: var(--s-4);
  align-items: start;
}

.panel {
  background: var(--surface);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius);
  box-shadow: var(--shadow);
  padding: var(--s-4);
}

.panel--list {
  grid-area: list;
  position: sticky;
  top: var(--s-4);
  max-height: calc(100dvh - 2 * var(--s-4));
  overflow-y: auto;
}

.panel--main {
  grid-area: main;
  padding: var(--s-5);
}

.panel--settings {
  grid-area: settings;
  position: sticky;
  top: var(--s-4);
}

/* Under 1024 px the settings move below the editor and the list collapses into a menu. */
@media (max-width: 1023px) {
  .editor__panels {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas:
      "list"
      "main"
      "settings";
  }

  .panel--list,
  .panel--settings {
    position: static;
    max-height: none;
  }
}
</style>
