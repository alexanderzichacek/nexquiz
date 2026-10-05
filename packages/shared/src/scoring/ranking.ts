export interface RankInput {
  playerId: string;
  /** Total score in integer hundredths (avoids float comparison). */
  scoreHundredths: number;
  /** Sum of `answeredMs` of correct answers – tie-breaker, lower is better. */
  correctAnsweredMs: number;
}

export type Ranked<T> = T & { rank: number };

/**
 * Sorts players by score (desc), then by `correctAnsweredMs` (asc).
 * Players equal in both share the same rank (1, 1, 3, …).
 */
export function rankPlayers<T extends RankInput>(players: readonly T[]): Ranked<T>[] {
  const sorted = [...players].sort(
    (a, b) =>
      b.scoreHundredths - a.scoreHundredths ||
      a.correctAnsweredMs - b.correctAnsweredMs ||
      a.playerId.localeCompare(b.playerId),
  );
  const ranked: Ranked<T>[] = [];
  sorted.forEach((p, i) => {
    const prev = ranked[i - 1];
    const tied =
      prev !== undefined &&
      prev.scoreHundredths === p.scoreHundredths &&
      prev.correctAnsweredMs === p.correctAnsweredMs;
    ranked.push({ ...p, rank: tied ? prev.rank : i + 1 });
  });
  return ranked;
}

/** Rank change for the leaderboard: positive = moved up (▲), negative = down (▼). */
export function rankChange(previousRank: number | null | undefined, currentRank: number): number {
  return previousRank == null ? 0 : previousRank - currentRank;
}
