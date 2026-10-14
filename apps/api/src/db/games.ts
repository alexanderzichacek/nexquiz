import {
  isQuestion,
  quizSnapshotSchema,
  type GameHistoryItem,
  type GameResultsResponse,
  type QuizSnapshot,
} from "@nexquiz/shared";
import { and, asc, desc, eq, notInArray, sql } from "drizzle-orm";
import type { GamePersistence, PersistedAnswer, PersistedPlayer } from "../game/ports.js";
import type { Database } from "./client.js";
import { gameAnswers, gamePlayers, games } from "./schema.js";

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

const HISTORY_LIMIT = 200;

const historyColumns = {
  id: games.id,
  quizId: games.quizId,
  pin: games.pin,
  status: games.status,
  createdAt: games.createdAt,
  startedAt: games.startedAt,
  finishedAt: games.finishedAt,
  quizTitle: sql<string | null>`${games.quizSnapshot}->>'title'`,
  // Raw names on purpose: Drizzle renders `${games.id}` unqualified in a single-table select,
  // which would bind to the subquery's own `id`.
  playerCount: sql<number>`(select count(*) from game_players gp where gp.game_id = "games"."id")`.mapWith(Number),
  winner: sql<string | null>`(select gp.nickname from game_players gp
    where gp.game_id = "games"."id" and gp.final_rank = 1
    order by gp.score desc, gp.nickname asc limit 1)`,
};

interface HistoryRow {
  id: string;
  quizId: string | null;
  pin: string;
  status: GameHistoryItem["status"];
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  quizTitle: string | null;
  playerCount: number;
  winner: string | null;
}

function toHistoryItem(r: HistoryRow): GameHistoryItem {
  return {
    id: r.id,
    quizId: r.quizId,
    quizTitle: r.quizTitle ?? "",
    pin: r.pin,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
    startedAt: r.startedAt?.toISOString() ?? null,
    finishedAt: r.finishedAt?.toISOString() ?? null,
    playerCount: Number(r.playerCount),
    winner: r.winner,
  };
}

async function upsertPlayers(tx: Tx, gameId: string, players: readonly PersistedPlayer[]): Promise<void> {
  if (players.length === 0) {
    await tx.delete(gamePlayers).where(eq(gamePlayers.gameId, gameId));
    return;
  }
  await tx
    .insert(gamePlayers)
    .values(
      players.map((p) => ({
        id: p.id,
        gameId,
        nickname: p.nickname,
        score: p.score.toFixed(2),
        finalRank: p.finalRank ?? null,
      })),
    )
    .onConflictDoUpdate({
      target: gamePlayers.id,
      set: {
        nickname: sql`excluded.nickname`,
        score: sql`excluded.score`,
        finalRank: sql`excluded.final_rank`,
      },
    });
  // Kicked players are no longer part of the game.
  await tx.delete(gamePlayers).where(
    and(
      eq(gamePlayers.gameId, gameId),
      notInArray(
        gamePlayers.id,
        players.map((p) => p.id),
      ),
    ),
  );
}

/** Game history in Postgres: persistence of running games + history queries. */
export class GameRepository implements GamePersistence {
  constructor(private readonly db: Database) {}

  async createGame(game: { id: string; quizId: string; pin: string; snapshot: QuizSnapshot }): Promise<void> {
    await this.db.insert(games).values({
      id: game.id,
      quizId: game.quizId,
      pin: game.pin,
      status: "lobby",
      quizSnapshot: game.snapshot,
    });
  }

  async markStarted(gameId: string, startedAt: Date): Promise<void> {
    await this.db.update(games).set({ status: "running", startedAt }).where(eq(games.id, gameId));
  }

  async saveProgress(
    gameId: string,
    players: readonly PersistedPlayer[],
    answers: readonly PersistedAnswer[],
  ): Promise<void> {
    await this.db.transaction(async (tx) => {
      await upsertPlayers(tx, gameId, players);
      const known = new Set(players.map((p) => p.id));
      const rows = answers.filter((a) => known.has(a.playerId));
      if (rows.length === 0) return;
      await tx
        .insert(gameAnswers)
        .values(
          rows.map((a) => ({
            gameId,
            questionIndex: a.questionIndex,
            playerId: a.playerId,
            payload: a.payload,
            correctness: a.correctness.toFixed(3),
            points: a.points.toFixed(2),
            answeredMs: a.answeredMs,
          })),
        )
        .onConflictDoUpdate({
          target: [gameAnswers.gameId, gameAnswers.questionIndex, gameAnswers.playerId],
          set: {
            payload: sql`excluded.payload`,
            correctness: sql`excluded.correctness`,
            points: sql`excluded.points`,
            answeredMs: sql`excluded.answered_ms`,
          },
        });
    });
  }

  async finishGame(gameId: string, players: readonly PersistedPlayer[], finishedAt: Date): Promise<void> {
    await this.db.transaction(async (tx) => {
      await upsertPlayers(tx, gameId, players);
      await tx.update(games).set({ status: "finished", finishedAt }).where(eq(games.id, gameId));
    });
  }

  /** `GET /api/games` – newest first. */
  async history(): Promise<GameHistoryItem[]> {
    const rows = await this.db.select(historyColumns).from(games).orderBy(desc(games.createdAt)).limit(HISTORY_LIMIT);
    return rows.map(toHistoryItem);
  }

  /** `GET /api/games/:id/results`. */
  async results(gameId: string): Promise<GameResultsResponse | null> {
    const [row] = await this.db.select({ ...historyColumns, snapshot: games.quizSnapshot }).from(games).where(eq(games.id, gameId));
    if (!row) return null;
    const snapshot = quizSnapshotSchema.safeParse(row.snapshot);
    const players = await this.db
      .select()
      .from(gamePlayers)
      .where(eq(gamePlayers.gameId, gameId))
      .orderBy(sql`${gamePlayers.finalRank} asc nulls last`, desc(gamePlayers.score), asc(gamePlayers.nickname));
    const answers = await this.db
      .select()
      .from(gameAnswers)
      .where(eq(gameAnswers.gameId, gameId))
      .orderBy(asc(gameAnswers.questionIndex), asc(gameAnswers.playerId));
    return {
      game: toHistoryItem(row),
      // Pages have no answers; `index` stays the position among all items (= `game_answers.question_index`).
      questions: snapshot.success
        ? snapshot.data.questions.flatMap((q, index) =>
            isQuestion(q) ? [{ index, type: q.type, prompt: q.prompt, points: q.points }] : [],
          )
        : [],
      players: players.map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: Number(p.score),
        finalRank: p.finalRank,
      })),
      answers: answers.map((a) => ({
        questionIndex: a.questionIndex,
        playerId: a.playerId,
        correctness: Number(a.correctness),
        points: Number(a.points),
        answeredMs: a.answeredMs,
      })),
    };
  }
}
