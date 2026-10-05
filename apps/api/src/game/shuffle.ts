import { randomInt } from "node:crypto";
import type { Question } from "@nexquiz/shared";

/** Returns an integer in `[0, maxExclusive)`. */
export type RandomInt = (maxExclusive: number) => number;

export const cryptoRandomInt: RandomInt = (maxExclusive) => randomInt(maxExclusive);

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle<T>(items: readonly T[], random: RandomInt): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    const a = out[i];
    const b = out[j];
    if (a === undefined || b === undefined) continue;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/**
 * Shuffle that is guaranteed to differ from the input order (for ≥ 2 distinct
 * items): when the shuffle happens to be the identity, it is rotated by one.
 */
export function shuffleNotIdentity(ids: readonly string[], random: RandomInt): string[] {
  const out = shuffle(ids, random);
  if (ids.length >= 2 && out.every((id, i) => id === ids[i])) {
    const first = out.shift();
    if (first !== undefined) out.push(first);
  }
  return out;
}

/**
 * Order in which options / items are shown for a question
 * (`game:{pin}:shuffle:{idx}`), or `null` when the authored order is used.
 * - `order` items are always shuffled and never in the correct order,
 * - `single` / `multi` options are shuffled only with `shuffleOptions`.
 */
export function presentationOrder(question: Question, shuffleOptions: boolean, random: RandomInt): string[] | null {
  switch (question.type) {
    case "order":
      return shuffleNotIdentity(
        question.data.items.map((i) => i.id),
        random,
      );
    case "single":
    case "multi":
      return shuffleOptions
        ? shuffle(
            question.data.options.map((o) => o.id),
            random,
          )
        : null;
    case "hotspot":
    case "text":
    case "music":
      return null;
  }
}
