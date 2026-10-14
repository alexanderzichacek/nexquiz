import { fileURLToPath } from "node:url";
import fastifyMultipart from "@fastify/multipart";
import fastifyRateLimit from "@fastify/rate-limit";
import type { ErrorCode, ErrorResponse } from "@nexquiz/shared";
import Fastify, { type FastifyInstance } from "fastify";
import { clientIp } from "./clientIp.js";
import type { Config } from "./config.js";
import type { DbHandle } from "./db/client.js";
import { GameRepository } from "./db/games.js";
import { MediaRepository } from "./db/media.js";
import { QuizRepository } from "./db/quizzes.js";
import { AppError, isAppError } from "./errors.js";
import { GameService } from "./game/GameService.js";
import { noopNotifier, type GameNotifier } from "./game/ports.js";
import { TimerScheduler, type Scheduler } from "./game/scheduler.js";
import { ClipService, FfmpegClipCutter } from "./media/clips.js";
import { MediaService } from "./media/service.js";
import { LocalDiskMediaStorage } from "./media/storage.js";
import { authRoutes } from "./rest/auth.js";
import { gameRoutes } from "./rest/games.js";
import { healthRoutes } from "./rest/health.js";
import { mediaRoutes } from "./rest/media.js";
import { quizRoutes } from "./rest/quizzes.js";
import { registerSession } from "./rest/session.js";
import { staticRoutes } from "./rest/static.js";
import { RedisGameStore } from "./store/redisGameStore.js";
import type { RedisHandle } from "./store/redis.js";

/** `apps/api/public` – the web build is copied here in the Docker image. */
export const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const MB = 1024 * 1024;

/** What the HTTP layer needs from each service (structural, so tests can pass fakes). */
export type QuizStore = Pick<QuizRepository, "list" | "get" | "create" | "update" | "duplicate" | "delete">;
export type MediaFiles = Pick<MediaService, "upload" | "get" | "storage">;
export type GameHistory = Pick<GameRepository, "history" | "results">;
export type ClipSource = Pick<ClipService, "clip">;

export interface AppServices {
  quizzes: QuizStore;
  media: MediaFiles;
  /** Audio clips for players with sound on their own device. */
  clips: ClipSource;
  games: GameService;
  history: GameHistory;
}

export interface AppDeps {
  config: Config;
  db: DbHandle;
  redis: RedisHandle;
  publicDir?: string;
  /** Pino log level; tests pass `silent`. */
  logLevel?: "fatal" | "error" | "warn" | "info" | "debug" | "trace" | "silent";
  /** Realtime output of the game service (bound to Socket.IO by the server). */
  notifier?: GameNotifier;
  scheduler?: Scheduler;
  /** Replaces the default services (tests). */
  services?: (app: FastifyInstance) => AppServices;
}

declare module "fastify" {
  interface FastifyInstance {
    services: AppServices;
  }
}

/** Default wiring: Postgres repositories, Redis game store, local media disk. */
export function createServices(app: FastifyInstance, deps: AppDeps): AppServices {
  const { config } = deps;
  const quizzes = new QuizRepository(deps.db.db);
  const history = new GameRepository(deps.db.db);
  const media = new MediaService(new LocalDiskMediaStorage(config.MEDIA_DIR), new MediaRepository(deps.db.db), {
    imageBytes: config.MAX_IMAGE_MB * MB,
    audioBytes: config.MAX_AUDIO_MB * MB,
    videoBytes: config.MAX_VIDEO_MB * MB,
  });
  const games = new GameService({
    store: new RedisGameStore(deps.redis.redis, Math.round(config.GAME_TTL_HOURS * 3600)),
    persistence: history,
    quizzes,
    notifier: deps.notifier ?? noopNotifier,
    scheduler: deps.scheduler ?? new TimerScheduler(),
    log: app.log.child({ module: "game" }),
  });
  const clips = new ClipService(media, new FfmpegClipCutter());
  return { quizzes, media, clips, games, history };
}

function errorCodeForStatus(status: number, isValidation: boolean): ErrorCode {
  if (isValidation || status === 400) return "INVALID";
  if (status === 401 || status === 403) return "UNAUTHORIZED";
  if (status === 404) return "NOT_FOUND";
  if (status === 413) return "PAYLOAD_TOO_LARGE";
  if (status === 406 || status === 415) return "UNSUPPORTED_MEDIA_TYPE";
  if (status === 429) return "RATE_LIMITED";
  return "INTERNAL";
}

/** Builds the Fastify app (no listening, no migrations, no Socket.IO) – reusable in tests. */
export async function buildApp(deps: AppDeps): Promise<FastifyInstance> {
  const { config } = deps;
  const app = Fastify({
    trustProxy: true,
    logger: {
      level: deps.logLevel ?? (config.NODE_ENV === "development" ? "debug" : "info"),
      redact: ["req.headers.cookie", "req.headers.authorization", 'res.headers["set-cookie"]'],
    },
  });

  // Clients get stable error codes only, never messages or stack traces.
  app.setErrorHandler<{ statusCode?: number; validation?: unknown }>((err, req, reply) => {
    if (isAppError(err)) {
      if (err.statusCode >= 500) req.log.error({ err }, "request failed");
      const body: ErrorResponse = { error: err.code };
      return reply.code(err.statusCode).send(body);
    }
    const status = err.statusCode !== undefined && err.statusCode >= 400 ? err.statusCode : 500;
    if (status >= 500) req.log.error({ err }, "request failed");
    const body: ErrorResponse = { error: errorCodeForStatus(status, err.validation !== undefined) };
    return reply.code(status).send(body);
  });

  await registerSession(app, config.SESSION_SECRET);
  await app.register(fastifyRateLimit, {
    global: false,
    // Not `req.ip`: with trustProxy it is the left-most (client-controlled) X-Forwarded-For entry.
    keyGenerator: (req) => clientIp(req.headers, req.socket.remoteAddress),
    errorResponseBuilder: () => new AppError("RATE_LIMITED"),
  });
  await app.register(fastifyMultipart, {
    limits: {
      fileSize: Math.max(config.MAX_IMAGE_MB, config.MAX_AUDIO_MB, config.MAX_VIDEO_MB) * MB,
      files: 1,
      fields: 10,
      parts: 20,
    },
  });

  const services = deps.services ? deps.services(app) : createServices(app, deps);
  app.decorate("services", services);

  await healthRoutes(app, { pingDb: () => deps.db.ping(), pingRedis: () => deps.redis.ping() });
  await authRoutes(app, { adminPassword: config.ADMIN_PASSWORD });
  await quizRoutes(app, { quizzes: services.quizzes });
  await mediaRoutes(app, { media: services.media });
  await gameRoutes(app, {
    games: services.games,
    history: services.history,
    clips: services.clips,
    publicUrl: config.PUBLIC_URL,
    existsRateLimitPerMin: config.EXISTS_RATE_LIMIT_PER_MIN,
  });
  await staticRoutes(app, deps.publicDir ?? PUBLIC_DIR);

  return app;
}
