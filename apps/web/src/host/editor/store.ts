import {
  isQuestion,
  questionCount,
  questionNumber,
  quizDtoSchema,
  quizUpdateRequestSchema,
  type Question,
  type QuestionType,
  type QuizItem,
  type QuizUpdateRequest,
} from "@nexquiz/shared";
import { defineStore } from "pinia";
import { computed, ref, watch } from "vue";
import { ApiError, apiRequest } from "@/lib/api";
import { changeQuestionType, cloneJson, createPage, createQuestion, duplicateQuestion } from "./defaults";
import { validateQuiz, type ErrorMap, type QuizValidation } from "./validation";

/** Autosave debounce (LOGIC.md: 1 s). */
export const AUTOSAVE_DEBOUNCE_MS = 1000;

/**
 * `pending`/`saving` → „Ukladám…“, `saved` → „Uložené ✓“,
 * `error` → „Chyba ukladania – skúsiť znova“, `invalid` → not saved because of validation errors.
 */
export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error" | "invalid";

export type LoadState = "loading" | "ready" | "not-found" | "error";

const EMPTY_VALIDATION: QuizValidation = { valid: true, quiz: {}, questions: {} };
const NO_ERRORS: ErrorMap = {};

/** State of the quiz editor: the editable draft, selection and autosave. */
export const useQuizEditorStore = defineStore("quizEditor", () => {
  const quizId = ref<string | null>(null);
  const draft = ref<QuizUpdateRequest | null>(null);
  const loadState = ref<LoadState>("loading");
  const selectedId = ref<string | null>(null);
  const status = ref<SaveStatus>("idle");

  /** JSON of the draft as last stored on the server. */
  let savedRaw = "";
  let timer: ReturnType<typeof setTimeout> | undefined;
  let inFlight: Promise<void> | null = null;

  const validation = computed<QuizValidation>(() => (draft.value ? validateQuiz(draft.value) : EMPTY_VALIDATION));
  /** Items of the quiz in order: questions and pages. */
  const questions = computed<QuizItem[]>(() => draft.value?.questions ?? []);
  const selectedIndex = computed(() => questions.value.findIndex((q) => q.id === selectedId.value));
  const selected = computed<QuizItem | null>(() => questions.value[selectedIndex.value] ?? null);
  /** The selected item when it is a question (a page has no question settings). */
  const selectedQuestion = computed<Question | null>(() => (selected.value && isQuestion(selected.value) ? selected.value : null));
  /** Number of questions (pages are not counted) and the number of the selected one. */
  const totalQuestions = computed(() => questionCount(questions.value));
  const selectedNumber = computed(() => (selectedIndex.value < 0 ? 0 : questionNumber(questions.value, selectedIndex.value)));

  function errorsOf(questionId: string): ErrorMap {
    return validation.value.questions[questionId] ?? NO_ERRORS;
  }

  function isDirty(): boolean {
    return draft.value !== null && JSON.stringify(draft.value) !== savedRaw;
  }

  function clearTimer(): void {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  }

  function reset(): void {
    clearTimer();
    quizId.value = null;
    draft.value = null;
    selectedId.value = null;
    status.value = "idle";
    loadState.value = "loading";
    savedRaw = "";
  }

  async function load(id: string): Promise<void> {
    reset();
    quizId.value = id;
    try {
      const quiz = await apiRequest(`/api/quizzes/${encodeURIComponent(id)}`, quizDtoSchema);
      if (quizId.value !== id) return;
      const next: QuizUpdateRequest = {
        title: quiz.title,
        description: quiz.description,
        settings: quiz.settings,
        questions: quiz.questions,
      };
      savedRaw = JSON.stringify(next);
      draft.value = next;
      selectedId.value = next.questions[0]?.id ?? null;
      loadState.value = "ready";
    } catch (err) {
      if (quizId.value !== id) return;
      loadState.value = err instanceof ApiError && (err.code === "NOT_FOUND" || err.code === "INVALID") ? "not-found" : "error";
    }
  }

  /** Debounced autosave on every change of the draft. */
  watch(
    draft,
    () => {
      if (!isDirty()) return;
      clearTimer();
      status.value = validation.value.valid ? "pending" : "invalid";
      timer = setTimeout(() => void save(), AUTOSAVE_DEBOUNCE_MS);
    },
    { deep: true },
  );

  /**
   * Validates and stores the whole quiz (`PUT /api/quizzes/:id`).
   * Resolves to true when the server has the current draft.
   */
  async function save(): Promise<boolean> {
    clearTimer();
    while (inFlight) await inFlight;
    const id = quizId.value;
    const current = draft.value;
    if (!id || !current) return false;
    const raw = JSON.stringify(current);
    if (raw === savedRaw) {
      if (status.value !== "idle") status.value = "saved";
      return true;
    }
    const parsed = quizUpdateRequestSchema.safeParse(current);
    if (!parsed.success) {
      status.value = "invalid";
      return false;
    }

    status.value = "saving";
    let ok = false;
    inFlight = (async () => {
      try {
        await apiRequest(`/api/quizzes/${encodeURIComponent(id)}`, quizDtoSchema, { method: "PUT", body: parsed.data });
        if (quizId.value === id) savedRaw = raw;
        ok = true;
      } catch {
        ok = false;
      }
    })();
    await inFlight;
    inFlight = null;
    if (quizId.value !== id) return ok;

    if (!ok) {
      status.value = "error";
      return false;
    }
    // Changes made while the request was running are saved by the pending timer.
    status.value = isDirty() ? (validation.value.valid ? "pending" : "invalid") : "saved";
    return !isDirty();
  }

  /** Saves immediately (route leave, game start). */
  async function flush(): Promise<boolean> {
    if (!isDirty() && !inFlight) return true;
    return save();
  }

  function select(id: string): void {
    selectedId.value = id;
  }

  /** Inserts `item` after the selected one (or at the end) and selects it. */
  function insert(item: QuizItem): void {
    if (!draft.value) return;
    const at = selectedIndex.value >= 0 ? selectedIndex.value + 1 : draft.value.questions.length;
    draft.value.questions.splice(at, 0, item);
    selectedId.value = item.id;
  }

  function addQuestion(type: QuestionType): void {
    insert(createQuestion(type));
  }

  function addPage(): void {
    insert(createPage());
  }

  function duplicate(id: string): void {
    if (!draft.value) return;
    const index = draft.value.questions.findIndex((q) => q.id === id);
    const original = draft.value.questions[index];
    if (!original) return;
    const copy = duplicateQuestion(original);
    draft.value.questions.splice(index + 1, 0, copy);
    selectedId.value = copy.id;
  }

  function remove(id: string): void {
    if (!draft.value) return;
    const index = draft.value.questions.findIndex((q) => q.id === id);
    if (index < 0) return;
    draft.value.questions.splice(index, 1);
    if (selectedId.value === id) {
      const next = draft.value.questions[Math.min(index, draft.value.questions.length - 1)];
      selectedId.value = next?.id ?? null;
    }
  }

  function setQuestions(next: QuizItem[]): void {
    if (draft.value) draft.value.questions = next;
  }

  function changeType(id: string, type: QuestionType): void {
    if (!draft.value) return;
    const index = draft.value.questions.findIndex((q) => q.id === id);
    const question = draft.value.questions[index];
    if (!question || question.type === "page" || question.type === type) return;
    draft.value.questions.splice(index, 1, changeQuestionType(cloneJson(question), type));
  }

  return {
    quizId,
    draft,
    loadState,
    selectedId,
    status,
    validation,
    questions,
    selectedIndex,
    selected,
    selectedQuestion,
    totalQuestions,
    selectedNumber,
    errorsOf,
    isDirty,
    reset,
    load,
    save,
    flush,
    select,
    addQuestion,
    addPage,
    duplicate,
    remove,
    setQuestions,
    changeType,
  };
});
