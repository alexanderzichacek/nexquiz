import {
  fractionToNumber,
  matchesNormalized,
  normalize,
  questionRevealEventSchema,
  type AnswerGroup,
  type FieldGroups,
  type Question,
  type QuestionRevealEvent,
  type RevealStats,
} from "@nexquiz/shared";
import { overrideKey } from "../store/gameStore.js";
import { buildCorrectAnswer } from "./sanitize.js";
import { fieldInputs, type ScoredAnswer } from "./scoring.js";

/** Max. raw examples shown per normalized group. */
const MAX_EXAMPLES = 5;

interface FieldDef {
  key: FieldGroups["key"];
  accepted: readonly string[];
}

function groupField(
  field: FieldDef,
  question: Extract<Question, { type: "text" | "music" }>,
  questionIndex: number,
  scored: ReadonlyMap<string, ScoredAnswer>,
  overrides: ReadonlyMap<string, boolean>,
): FieldGroups {
  const tolerance = question.data.tolerance;
  const aliases = field.accepted.map((a) => normalize(a));
  const groups = new Map<string, { examples: Set<string>; count: number }>();
  for (const entry of scored.values()) {
    const raw = fieldInputs(entry.answer)[field.key] ?? "";
    const norm = entry.normalized[field.key] ?? normalize(raw);
    if (norm === "") continue;
    const group = groups.get(norm) ?? { examples: new Set<string>(), count: 0 };
    group.count++;
    if (group.examples.size < MAX_EXAMPLES) group.examples.add(raw.trim());
    groups.set(norm, group);
  }

  const out: AnswerGroup[] = [...groups].map(([norm, g]) => {
    const auto = aliases.some((alias) => matchesNormalized(norm, alias, tolerance));
    const manual = overrides.get(overrideKey(questionIndex, field.key, norm));
    return {
      normalized: norm,
      examples: [...g.examples],
      count: g.count,
      accepted: manual ?? auto,
      overridden: manual !== undefined && manual !== auto,
    };
  });
  out.sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized));
  return { key: field.key, groups: out };
}

function buildStats(
  question: Question,
  questionIndex: number,
  scored: ReadonlyMap<string, ScoredAnswer>,
  overrides: ReadonlyMap<string, boolean>,
): RevealStats {
  switch (question.type) {
    case "single":
    case "multi": {
      const counts = new Map(question.data.options.map((o) => [o.id, 0]));
      for (const { answer } of scored.values()) {
        const chosen =
          answer?.type === "single" ? [answer.payload.optionId] : answer?.type === "multi" ? answer.payload.optionIds : [];
        for (const id of chosen) counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      const votes = [...counts].map(([optionId, count]) => ({ optionId, count }));
      return question.type === "single" ? { type: "single", votes } : { type: "multi", votes };
    }
    case "order": {
      const values = [...scored.values()].map((s) => Math.round(s.result.correctness * 1000));
      const sum = values.reduce((a, b) => a + b, 0);
      const averageCorrectness = values.length === 0 ? 0 : fractionToNumber({ num: sum, den: values.length * 1000 }, 3);
      return { type: "order", averageCorrectness };
    }
    case "hotspot": {
      const taps = [...scored.values()].flatMap((s) =>
        s.answer?.type === "hotspot" ? [{ x: s.answer.payload.x, y: s.answer.payload.y, hit: s.result.correctness > 0 }] : [],
      );
      return { type: "hotspot", taps };
    }
    case "text":
      return {
        type: "text",
        fields: question.data.fields.map((f) => groupField(f, question, questionIndex, scored, overrides)),
      };
    case "music":
      return {
        type: "music",
        fields: question.data.fields.map((f) => groupField(f, question, questionIndex, scored, overrides)),
      };
  }
}

/** `question:reveal` for the host: correct answer + statistics per type. */
export function buildReveal(
  question: Question,
  questionIndex: number,
  scored: ReadonlyMap<string, ScoredAnswer>,
  overrides: ReadonlyMap<string, boolean>,
): QuestionRevealEvent {
  return questionRevealEventSchema.parse({
    index: questionIndex,
    correct: buildCorrectAnswer(question),
    stats: buildStats(question, questionIndex, scored, overrides),
  });
}
