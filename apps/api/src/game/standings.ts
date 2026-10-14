import {
  fromHundredths,
  rankChange,
  rankPlayers,
  toHundredths,
  DEFAULT_AVATAR,
  type Avatar,
  type GameFinishedEvent,
  type LeaderboardEvent,
  type RankingEntry,
} from "@nexquiz/shared";
import type { PlayerRecord, ResultRecord } from "../store/gameStore.js";

export const LEADERBOARD_SIZE = 10;
export const PODIUM_SIZE = 3;

export interface Standing {
  playerId: string;
  nickname: string;
  avatar: Avatar;
  connected: boolean;
  /** Total score in hundredths (sum of all results). */
  scoreHundredths: number;
  /** Sum of `answeredMs` of correct answers – tie-breaker, lower is better. */
  correctAnsweredMs: number;
  /** Points gained in the last scored question, in hundredths. */
  deltaHundredths: number;
  rank: number;
  /** Rank before the last scored question (null when there is none). */
  previousRank: number | null;
}

interface Totals {
  playerId: string;
  scoreHundredths: number;
  correctAnsweredMs: number;
}

function totals(playerIds: readonly string[], results: readonly ReadonlyMap<string, ResultRecord>[]): Totals[] {
  return playerIds.map((playerId) => {
    let scoreHundredths = 0;
    let correctAnsweredMs = 0;
    for (const perQuestion of results) {
      const r = perQuestion.get(playerId);
      if (!r) continue;
      scoreHundredths += toHundredths(r.points);
      if (r.correctness > 0) correctAnsweredMs += r.answeredMs;
    }
    return { playerId, scoreHundredths, correctAnsweredMs };
  });
}

/**
 * Ranks the current players by total score (exact, in hundredths) and breaks
 * ties by the sum of `answeredMs` of correct answers. `results[i]` holds the
 * results of question `i`; the last entry is the "last question" used for
 * `delta` and `rankChange`.
 */
export function computeStandings(
  players: ReadonlyMap<string, PlayerRecord>,
  results: readonly ReadonlyMap<string, ResultRecord>[],
): Standing[] {
  const ids = [...players.keys()];
  const current = rankPlayers(totals(ids, results));
  const last = results[results.length - 1];
  const previous =
    results.length >= 2 ? new Map(rankPlayers(totals(ids, results.slice(0, -1))).map((r) => [r.playerId, r.rank])) : null;

  return current.map((r) => {
    const player = players.get(r.playerId);
    return {
      playerId: r.playerId,
      nickname: player?.nickname ?? "",
      avatar: player?.avatar ?? DEFAULT_AVATAR,
      connected: player?.connected ?? false,
      scoreHundredths: r.scoreHundredths,
      correctAnsweredMs: r.correctAnsweredMs,
      deltaHundredths: toHundredths(last?.get(r.playerId)?.points ?? 0),
      rank: r.rank,
      previousRank: previous?.get(r.playerId) ?? null,
    };
  });
}

/** `index` = item index of the question, `number` = its 1-based question number (pages are not counted). */
export function buildLeaderboard(index: number, number: number, standings: readonly Standing[]): LeaderboardEvent {
  return {
    index,
    number,
    top: standings.slice(0, LEADERBOARD_SIZE).map((s) => ({
      playerId: s.playerId,
      nickname: s.nickname,
      avatar: s.avatar,
      score: fromHundredths(s.scoreHundredths),
      delta: fromHundredths(s.deltaHundredths),
      rank: s.rank,
      rankChange: rankChange(s.previousRank, s.rank),
    })),
  };
}

export function buildRanking(standings: readonly Standing[]): RankingEntry[] {
  return standings.map((s) => ({
    playerId: s.playerId,
    nickname: s.nickname,
    avatar: s.avatar,
    score: fromHundredths(s.scoreHundredths),
    rank: s.rank,
  }));
}

export function buildFinished(standings: readonly Standing[]): GameFinishedEvent {
  const ranking = buildRanking(standings);
  return { podium: ranking.slice(0, PODIUM_SIZE), ranking };
}
