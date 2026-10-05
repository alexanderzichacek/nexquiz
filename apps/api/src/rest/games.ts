import {
  createGameRequestSchema,
  gameResultsQuerySchema,
  idParamsSchema,
  pinParamsSchema,
  type CreateGameResponse,
  type GameExistsResponse,
  type GameHistoryResponse,
  type GameResultsResponse,
} from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import type { GameHistory } from "../app.js";
import { AppError } from "../errors.js";
import type { GameService } from "../game/GameService.js";
import { resultsToCsv } from "./csv.js";
import { requireHost } from "./session.js";
import { parseInput } from "./validation.js";

/** Public PIN check is rate limited per IP. */
const EXISTS_RATE_LIMIT = { max: 30, timeWindow: "1 minute" } as const;

export interface GameRoutesOptions {
  games: GameService;
  history: GameHistory;
  publicUrl: string | undefined;
}

/** Games: create, QR, exists (public), history, results (+ CSV). */
export async function gameRoutes(app: FastifyInstance, opts: GameRoutesOptions): Promise<void> {
  const { games, history } = opts;

  app.get(
    "/api/games/:pin/exists",
    { config: { rateLimit: EXISTS_RATE_LIMIT } },
    async (req, reply): Promise<GameExistsResponse> => {
      reply.header("Cache-Control", "no-store");
      const params = pinParamsSchema.safeParse(req.params);
      return { exists: params.success ? await games.gameExists(params.data.pin) : false };
    },
  );

  await app.register(async (scope) => {
    scope.addHook("onRequest", requireHost);

    scope.post("/api/games", async (req, reply) => {
      const { quizId } = parseInput(createGameRequestSchema, req.body);
      const created: CreateGameResponse = await games.createGame(quizId);
      return reply.code(201).send(created);
    });

    scope.get("/api/games/:pin/qr", async (req, reply) => {
      const { pin } = parseInput(pinParamsSchema, req.params);
      const base = opts.publicUrl ?? `${req.protocol}://${req.host}`;
      const url = `${base}/play?pin=${pin}`;
      const png = await QRCode.toBuffer(url, { width: 512, margin: 1 });
      return reply.type("image/png").header("Cache-Control", "no-store").send(png);
    });

    scope.get("/api/games", async (): Promise<GameHistoryResponse> => history.history());

    scope.get("/api/games/:id/results", async (req, reply) => {
      const { id } = parseInput(idParamsSchema, req.params);
      const { format } = parseInput(gameResultsQuerySchema, req.query);
      const results: GameResultsResponse | null = await history.results(id);
      if (!results) throw new AppError("NOT_FOUND");
      if (format === "csv") {
        const date = (results.game.finishedAt ?? results.game.createdAt).slice(0, 10);
        return reply
          .type("text/csv; charset=utf-8")
          .header("Content-Disposition", `attachment; filename="nexquiz-${results.game.pin}-${date}.csv"`)
          .send(resultsToCsv(results));
      }
      return results;
    });
  });
}
