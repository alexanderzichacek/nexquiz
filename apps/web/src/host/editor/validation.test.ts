import { DEFAULT_QUIZ_SETTINGS, type QuizUpdateRequest } from "@nexquiz/shared";
import { describe, expect, it } from "vitest";
import { sk } from "@/i18n/sk";
import { createQuestion } from "./defaults";
import { validateQuiz } from "./validation";

function quizWith(questions: QuizUpdateRequest["questions"]): QuizUpdateRequest {
  return { title: "Kvíz", description: null, settings: { ...DEFAULT_QUIZ_SETTINGS }, questions };
}

describe("validateQuiz", () => {
  it("accepts a complete quiz", () => {
    const q = createQuestion("text");
    q.prompt = "Najvyšší štít Tatier?";
    q.data.fields[0].accepted = ["Gerlachovský štít", "Gerlach"];
    expect(validateQuiz(quizWith([q]))).toEqual({ valid: true, quiz: {}, questions: {} });
  });

  it("maps issues to inline Slovak messages per question", () => {
    const q = createQuestion("single");
    const second = q.data.options[1];
    if (second) second.text = "B";
    const result = validateQuiz(quizWith([q]));
    expect(result.valid).toBe(false);
    const errors = result.questions[q.id] ?? {};
    expect(errors.prompt).toBe(sk.editorErrors.prompt);
    expect(errors["data.options.0.text"]).toBe(sk.editorErrors.optionText);
    expect(errors["data.options.1.text"]).toBeUndefined();
  });

  it("reports every editor rule of a question at once (hotspot without image and targets)", () => {
    const q = createQuestion("hotspot");
    const errors = validateQuiz(quizWith([q])).questions[q.id] ?? {};
    expect(errors.prompt).toBe(sk.editorErrors.prompt);
    expect(errors["media.imageId"]).toBe(sk.editorErrors.image);
    expect(errors["data.targets"]).toBe(sk.editorErrors.targets);
  });

  it("music needs audio, aliases in both fields and weights summing to 1", () => {
    const q = createQuestion("music");
    q.prompt = "Ktorá kapela?";
    q.data.fields[0].weight = 0.6;
    const errors = validateQuiz(quizWith([q])).questions[q.id] ?? {};
    expect(errors["media.audioId"]).toBe(sk.editorErrors.audio);
    expect(errors["data.fields.0.accepted"]).toBe(sk.editorErrors.accepted);
    expect(errors["data.fields.1.accepted"]).toBe(sk.editorErrors.accepted);
    expect(errors["data.fields"]).toBe(sk.editorErrors.weightsSum);
  });

  it("flags multi without a correct option and an out-of-range time limit", () => {
    const q = createQuestion("multi");
    q.prompt = "Ktoré sú prvočísla?";
    q.data.options.forEach((o, i) => (o.text = String(i + 2)));
    q.data.correctIds = [];
    q.timeLimit = 121;
    const errors = validateQuiz(quizWith([q])).questions[q.id] ?? {};
    expect(errors["data.correctIds"]).toBe(sk.editorErrors.correctIds);
    expect(errors.timeLimit).toBe(sk.editorErrors.timeLimit);
  });

  it("treats NaN from an emptied number input as an error", () => {
    const q = createQuestion("text");
    q.prompt = "Otázka";
    q.data.fields[0].accepted = ["a"];
    q.points = Number.NaN;
    expect(validateQuiz(quizWith([q])).questions[q.id]?.points).toBe(sk.editorErrors.points);
  });

  it("reports quiz level errors", () => {
    const result = validateQuiz({ ...quizWith([]), title: "  " });
    expect(result.valid).toBe(false);
    expect(result.quiz.title).toBe(sk.editorErrors.title);
  });
});
