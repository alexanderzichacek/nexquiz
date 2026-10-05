import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { runMigrations } from "./db/migrate.js";
import { TimerScheduler } from "./game/scheduler.js";
import { attachRealtime } from "./realtime/index.js";
import { SocketNotifier } from "./realtime/notifier.js";
import { hostCookieVerifier } from "./rest/session.js";
import { createRedis } from "./store/redis.js";

/** Process entry point: config → migrations → HTTP + Socket.IO server → timer restore. */
async function main(): Promise<void> {
  const config = loadConfig();
  const db = createDb(config.DATABASE_URL);
  const redis = createRedis(config.REDIS_URL);
  const notifier = new SocketNotifier();
  const scheduler = new TimerScheduler();

  const app = await buildApp({ config, db, redis, notifier, scheduler });
  redis.redis.on("error", (err: Error) => app.log.error({ err }, "redis error"));

  const realtime = attachRealtime(app.server, {
    games: app.services.games,
    notifier,
    verifyHost: hostCookieVerifier(app),
    log: app.log.child({ module: "realtime" }),
    redis: redis.redis,
  });
  app.addHook("preClose", async () => {
    scheduler.cancelAll();
    await realtime.close();
  });

  app.log.info("running database migrations");
  await runMigrations(db.db);
  app.log.info("database migrations done");

  let closing = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      await Promise.allSettled([db.close(), redis.close()]);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
  const restored = await app.services.games.restoreTimers();
  if (restored > 0) app.log.info({ restored }, "question timers restored from Redis");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
