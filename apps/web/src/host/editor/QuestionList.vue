<script setup lang="ts">
import { isPage, QUESTION_TYPES, questionNumber, type QuestionType, type QuizItem } from "@nexquiz/shared";
import { computed, nextTick, ref, useTemplateRef, watch } from "vue";
import BaseButton from "@/components/BaseButton.vue";
import SortableList from "@/components/SortableList.vue";
import { format, sk } from "@/i18n/sk";
import { useMediaQuery } from "@/lib/useMediaQuery";
import { useConfirmStore } from "@/stores/confirm";
import { useQuizEditorStore } from "./store";
import { PAGE_ICON, TYPE_ICONS } from "./typeIcons";

/**
 * Left panel: question list with drag & drop, type icon and error dot. The
 * selected question gets a toolbar row (↑ ↓ duplicate delete) below it, so
 * the narrow panel keeps the full width for the number, type and prompt.
 */
const editor = useQuizEditorStore();
const confirm = useConfirmStore();

/** Under 1024 px the list collapses into a drop-down menu. */
const narrow = useMediaQuery("(max-width: 1023px)");
const expanded = ref(false);
const addOpen = ref(false);
const addMenuEl = useTemplateRef<HTMLElement>("addMenuEl");

const list = computed<QuizItem[]>({
  get: () => editor.questions,
  set: (value) => editor.setQuestions(value),
});

const showList = computed(() => !narrow.value || expanded.value);

watch(narrow, () => {
  expanded.value = false;
});

function hasErrors(id: string): boolean {
  return Object.keys(editor.errorsOf(id)).length > 0;
}

function pick(id: string): void {
  editor.select(id);
  if (narrow.value) expanded.value = false;
}

async function toggleAdd(): Promise<void> {
  addOpen.value = !addOpen.value;
  if (addOpen.value) {
    await nextTick();
    addMenuEl.value?.querySelector<HTMLButtonElement>("button")?.focus();
  }
}

function add(type: QuestionType): void {
  editor.addQuestion(type);
  addOpen.value = false;
  if (narrow.value) expanded.value = false;
}

function addPage(): void {
  editor.addPage();
  addOpen.value = false;
  if (narrow.value) expanded.value = false;
}

/** Glyph, short type name and text of a list row (a page shows its title). */
function iconOf(item: QuizItem): string {
  return isPage(item) ? PAGE_ICON : TYPE_ICONS[item.type];
}

function shortOf(item: QuizItem): string {
  return isPage(item) ? sk.editor.pageShort : sk.questionTypes[item.type].short;
}

function textOf(item: QuizItem): string {
  return isPage(item)
    ? item.title.trim() || item.description.trim() || sk.editor.untitledPage
    : item.prompt.trim() || sk.editor.untitledQuestion;
}

/** Pages are not numbered: questions count only the questions before them. */
function numberOf(item: QuizItem, index: number): string {
  return isPage(item) ? "" : String(questionNumber(editor.questions, index));
}

async function remove(item: QuizItem, index: number): Promise<void> {
  const page = isPage(item);
  const ok = await confirm.ask({
    title: page ? sk.editor.deletePageTitle : sk.editor.deleteQuestionTitle,
    message: page
      ? sk.editor.deletePageMessage
      : format(sk.editor.deleteQuestionMessage, { index: questionNumber(editor.questions, index) }),
    confirmLabel: sk.common.delete,
    cancelLabel: sk.common.cancel,
    danger: true,
  });
  if (ok) editor.remove(item.id);
}
</script>

<template>
  <nav class="ql" :aria-label="sk.editor.questions">
    <div class="ql__head">
      <h2 class="ql__title">{{ sk.editor.questions }}</h2>
      <button
        v-if="narrow"
        type="button"
        class="ql__toggle"
        :aria-expanded="expanded"
        aria-controls="question-list"
        @click="expanded = !expanded"
      >
        {{
          format(sk.editor.questionsToggle, {
            index: editor.selectedIndex + 1,
            total: editor.questions.length,
          })
        }}
        <span aria-hidden="true">{{ expanded ? "▴" : "▾" }}</span>
      </button>
    </div>

    <div v-show="showList" id="question-list" class="ql__body">
      <p v-if="list.length === 0" class="hint">{{ sk.editor.noQuestions }}</p>
      <SortableList v-model="list" dense slot-arrows>
        <template #default="{ item, index, move, first, last }">
          <div class="ql__item" :class="{ 'ql__item--active': item.id === editor.selectedId }">
            <button
              type="button"
              class="ql__pick"
              :aria-current="item.id === editor.selectedId ? 'true' : undefined"
              @click="pick(item.id)"
            >
              <span class="ql__num tabular">{{ numberOf(item, index) }}</span>
              <span class="ql__icon" aria-hidden="true">{{ iconOf(item) }}</span>
              <span class="ql__text">
                <span class="ql__type">{{ shortOf(item) }}</span>
                <span class="ql__prompt">{{ textOf(item) }}</span>
              </span>
              <span v-if="hasErrors(item.id)" class="ql__dot" :title="sk.editor.hasErrors">
                <span class="visually-hidden">{{ sk.editor.hasErrors }}</span>
              </span>
            </button>
            <span
              v-if="item.id === editor.selectedId"
              class="ql__actions"
              role="group"
              :aria-label="sk.editor.questionActions"
            >
              <button
                type="button"
                class="icon-btn"
                :aria-label="sk.common.moveUp"
                :title="sk.common.moveUp"
                :disabled="first"
                @click="move(-1)"
              >
                ↑
              </button>
              <button
                type="button"
                class="icon-btn"
                :aria-label="sk.common.moveDown"
                :title="sk.common.moveDown"
                :disabled="last"
                @click="move(1)"
              >
                ↓
              </button>
              <span class="ql__spacer"></span>
              <button
                type="button"
                class="icon-btn"
                :aria-label="sk.editor.duplicateQuestion"
                :title="sk.editor.duplicateQuestion"
                @click="editor.duplicate(item.id)"
              >
                ⧉
              </button>
              <button
                type="button"
                class="icon-btn icon-btn--danger"
                :aria-label="isPage(item) ? sk.editor.deletePage : sk.editor.deleteQuestion"
                :title="isPage(item) ? sk.editor.deletePage : sk.editor.deleteQuestion"
                @click="remove(item, index)"
              >
                ×
              </button>
            </span>
          </div>
        </template>
      </SortableList>

      <div class="ql__add">
        <BaseButton variant="secondary" block :aria-expanded="addOpen" @click="toggleAdd">
          {{ sk.editor.addQuestion }}
        </BaseButton>
        <div v-if="addOpen" ref="addMenuEl" class="ql__types" role="group" :aria-label="sk.editor.chooseType">
          <button
            v-for="t in QUESTION_TYPES"
            :key="t"
            type="button"
            class="ql__type-btn"
            @click="add(t)"
            @keydown.escape="addOpen = false"
          >
            <span class="ql__icon" aria-hidden="true">{{ TYPE_ICONS[t] }}</span>
            {{ sk.questionTypes[t].label }}
          </button>
          <button type="button" class="ql__type-btn" @click="addPage" @keydown.escape="addOpen = false">
            <span class="ql__icon" aria-hidden="true">{{ PAGE_ICON }}</span>
            {{ sk.editor.pageLabel }}
          </button>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.ql {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.ql__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s-2);
}

.ql__title {
  font-size: var(--fs-editor-option);
  font-weight: var(--fw-bold);
}

.ql__toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--s-2);
  min-height: var(--btn-h);
  padding: 0 var(--s-3);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  font-weight: var(--fw-semibold);
  cursor: pointer;
}

.ql__body {
  display: flex;
  flex-direction: column;
  gap: var(--s-3);
}

.ql__item {
  display: flex;
  flex-direction: column;
  border-left: var(--ring-selected) solid transparent;
  border-radius: var(--radius-sm);
}

.ql__item--active {
  background: var(--surface-2);
  border-left-color: var(--primary);
}

.ql__pick {
  width: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: var(--btn-h);
  padding: var(--s-1) var(--s-2);
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ql__num {
  min-width: var(--s-4);
  color: var(--text-muted);
  font-weight: var(--fw-semibold);
}

.ql__icon {
  width: var(--s-4);
  text-align: center;
}

.ql__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ql__type,
.ql__prompt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ql__type {
  font-size: var(--fs-editor-label);
  color: var(--text-muted);
}

.ql__dot {
  width: var(--dot);
  height: var(--dot);
  flex: none;
  border-radius: 50%;
  background: var(--danger);
}

.ql__actions {
  display: flex;
  align-items: center;
  padding: 0 var(--s-1) var(--s-1);
}

.ql__spacer {
  flex: 1;
}

.ql__add {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}

.ql__types {
  display: flex;
  flex-direction: column;
  padding: var(--s-1);
  border: var(--border-w) solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface);
  box-shadow: var(--shadow);
}

.ql__type-btn {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  min-height: var(--btn-h);
  padding: 0 var(--s-3);
  border: 0;
  border-radius: var(--radius-sm);
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.ql__type-btn:hover,
.ql__type-btn:focus-visible {
  background: var(--surface-2);
}
</style>
