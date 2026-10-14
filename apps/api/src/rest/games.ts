import {
  clipParamsSchema,
  createGameRequestSchema,
  gameResultsQuerySchema,
  idParamsSchema,
  pinParamsSchema,
  playerTokenSchema,
  type CreateGameResponse,
  type GameExistsResponse,
  type GameHistoryResponse,
  type GameResultsResponse,
} from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";
import QRCode from "qrcode";
import type { ClipSource, GameHistory } from "../app.js";
import { AppError } from "../errors.js";
import type { GameService } from "../game/GameService.js";
import { CLIP_MIME } from "../media/clips.js";
import { resultsToCsv } from "./csv.js";
import { requireHost } from "./session.js";
import { parseInput } from "./validation.js";

export interface GameRoutesOptions {
  games: GameService;
  history: GameHistory;
  clips: ClipSource;
  publicUrl: string | undefined;
  /** Public PIN check: max. requests per IP and minute (`EXISTS_RATE_LIMIT_PER_MIN`). */
  existsRateLimitPerMin: number;
}

/** Player token from `Authorization: Bearer {token}` (never in the URL, so it does not end up in logs). */
function bearerToken(header: string | undefined): string {
  const match = /^Bearer (\S+)$/.exec(header ?? "");
  const token = playerTokenSchema.safeParse(match?.[1]);
  if (!token.success) throw new AppError("INVALID_TOKEN");
  return token.data;
}

/** Games: create, QR, exists (public), player audio clip, history, results (+ CSV). */
export async function gameRoutes(app: FastifyInstance, opts: GameRoutesOptions): Promise<void> {
  const { games, history, clips } = opts;

  app.get(
    "/api/games/:pin/exists",
    { config: { rateLimit: { max: opts.existsRateLimitPerMin, timeWindow: "1 minute" } } },
    async (req, reply): Promise<GameExistsResponse> => {
      reply.header("Cache-Control", "no-store");
      const params = pinParamsSchema.safeParse(req.params);
      return { exists: params.success ? await games.gameExists(params.data.pin) : false };
    },
  );

  // Players with sound on their own device: the clip of the running question, cut and without tags.
  app.get("/api/games/:pin/questions/:index/clip", async (req, reply) => {
    const { pin, index } = parseInput(clipParamsSchema, req.params);
    const { audioId, clip } = await games.playerClip(pin, bearerToken(req.headers.authorization), index);
    const data = await clips.clip(audioId, clip);
    return reply.type(CLIP_MIME).header("Cache-Control", "private, no-store").send(data);
  });

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
