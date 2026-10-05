import {
  computePointsHundredths,
  fractionToNumber,
  fromHundredths,
  parseAnswerPayload,
  scoreAnswer,
  type Question,
  type QuizSnapshot,
  type TaggedAnswer,
} from "@nexquiz/shared";
import { overrideKey, type AnswerRecord, type ResultRecord } from "../store/gameStore.js";

export interface ScoredAnswer {
  answer: TaggedAnswer | null;
  result: ResultRecord;
  /** Normalized input per field (`text` / `music`). */
  normalized: Record<string, string>;
}

export interface ScoreQuestionInput {
  question: Question;
  questionIndex: number;
  answers: ReadonlyMap<string, AnswerRecord>;
  /** Server-measured answer time of a player (`receivedAt − questionStartedAt`). */
  answeredMs: (playerId: string, answer: AnswerRecord) => number;
  speedBonus: boolean;
  /** `height / width` of the hotspot image. */
  imageAspect: number;
  overrides: ReadonlyMap<string, boolean>;
}

/** `height / width` of the question image (hotspot), 1 when unknown. */
export function imageAspectOf(question: Question, snapshot: QuizSnapshot): number {
  const imageId = question.media?.imageId;
  const size = imageId === undefined ? undefined : snapshot.images[imageId];
  return size ? size.height / size.width : 1;
}

/** Text inputs of an answer by field key (`text` / `music`), `{}` otherwise. */
export function fieldInputs(answer: TaggedAnswer | null): Record<string, string> {
  if (answer?.type === "text" || answer?.type === "music") return { ...answer.payload.answers };
  return {};
}

/**
 * Scores every answer of one question on the server: correctness from the
 * shared scorers (host overrides take precedence), points computed exactly in
 * hundredths with a single rounding.
 */
export function scoreQuestion(input: ScoreQuestionInput): Map<string, ScoredAnswer> {
  const { question, questionIndex, overrides } = input;
  const override = (fieldKey: string, normalized: string): boolean | undefined =>
    overrides.get(overrideKey(questionIndex, fieldKey, normalized));

  const out = new Map<string, ScoredAnswer>();
  for (const [playerId, record] of input.answers) {
    const answeredMs = Math.max(0, Math.round(input.answeredMs(playerId, record)));
    const answer = parseAnswerPayload(question, record.payload);
    if (!answer) {
      out.set(playerId, { answer: null, result: { correctness: 0, points: 0, answeredMs }, normalized: {} });
      continue;
    }
    const score = scoreAnswer(question, answer, { imageAspect: input.imageAspect, override });
    const pointsHundredths = computePointsHundredths({
      points: question.points,
      correctness: score.correctness,
      answeredMs,
      timeLimitMs: question.timeLimit * 1000,
      speedBonus: input.speedBonus,
    });
    const result: ResultRecord = {
      correctness: fractionToNumber(score.correctness, 3),
      points: fromHundredths(pointsHundredths),
      answeredMs,
    };
    if (score.perField) result.perField = score.perField;
    out.set(playerId, { answer, result, normalized: score.normalized ?? {} });
  }
  return out;
}
