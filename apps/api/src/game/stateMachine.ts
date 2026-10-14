import type { GameStateName } from "@nexquiz/shared";
import { AppError } from "../errors.js";

/** Allowed transitions (LOGIC.md "Stavový automat hry"). */
export const TRANSITIONS: Readonly<Record<GameStateName, readonly GameStateName[]>> = {
  LOBBY: ["QUESTION", "PAGE", "FINISHED"],
  QUESTION: ["REVEAL", "FINISHED"],
  REVEAL: ["LEADERBOARD", "QUESTION", "PAGE", "FINISHED"],
  LEADERBOARD: ["QUESTION", "PAGE", "FINISHED"],
  PAGE: ["QUESTION", "PAGE", "FINISHED"],
  FINISHED: [],
};

export function canTransition(from: GameStateName, to: GameStateName): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Throws `INVALID_TRANSITION` when `from → to` is not in the state machine. */
export function assertTransition(from: GameStateName, to: GameStateName): void {
  if (!canTransition(from, to)) throw new AppError("INVALID_TRANSITION");
}
