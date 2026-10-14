import type { LeaderboardEntry } from "@nexquiz/shared";

/** Rank before the last question (`rankChange > 0` = moved up). */
export function previousRank(entry: Pick<LeaderboardEntry, "rank" | "rankChange">): number {
  return entry.rank + entry.rankChange;
}

/** Entries in the order of the previous leaderboard (start of the FLIP animation). */
export function byPreviousRank<T extends Pick<LeaderboardEntry, "rank" | "rankChange">>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => previousRank(a) - previousRank(b) || a.rank - b.rank);
}

/** Entries in the current order. */
export function byRank<T extends Pick<LeaderboardEntry, "rank">>(entries: readonly T[]): T[] {
  return [...entries].sort((a, b) => a.rank - b.rank);
}

/** Podium columns are shown in the order 2 – 1 – 3. */
export function podiumOrder<T extends { rank: number }>(podium: readonly T[]): T[] {
  const sorted = [...podium].sort((a, b) => a.rank - b.rank);
  const [first, second, third] = sorted;
  return [second, first, third].filter((e): e is T => e !== undefined);
}

/**
 * Final ranking without the podium players (4th place onward), in rank order.
 * Excludes by `playerId`, so a tie on the 3rd place that did not fit on the
 * podium still shows up in the rest.
 */
export function rankingRest<T extends { playerId: string; rank: number }>(
  ranking: readonly T[],
  podium: readonly Pick<T, "playerId">[],
): T[] {
  const onPodium = new Set(podium.map((p) => p.playerId));
  return byRank(ranking.filter((r) => !onPodium.has(r.playerId)));
}
