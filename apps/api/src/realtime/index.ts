import type { Server as HttpServer } from "node:http";
import { WS_NAMESPACES } from "@nexquiz/shared";
import { createAdapter } from "@socket.io/redis-adapter";
import type { Redis } from "ioredis";
import { Server } from "socket.io";
import type { GameService } from "../game/GameService.js";
import type { GameLogger } from "../game/ports.js";
import { registerHostNamespace } from "./host.js";
import type { SocketNotifier } from "./notifier.js";
import { registerPlayNamespace } from "./play.js";
import type { FixedWindowLimiter } from "./rateLimit.js";
import type { HostNamespace, PlayNamespace } from "./types.js";

export interface RealtimeDeps {
  games: GameService;
  notifier: SocketNotifier;
  verifyHost: (cookieHeader: string | undefined) => boolean;
  log: GameLogger;
  /** When given, the Socket.IO Redis adapter is attached (pub/sub duplicates of this client). */
  redis?: Redis;
  joinLimiter?: FixedWindowLimiter;
}

export interface Realtime {
  io: Server;
  close(): Promise<void>;
}

/** Socket.IO on the same HTTP server as Fastify (`/socket.io`), namespaces `/host` and `/play`. */
export function attachRealtime(server: HttpServer, deps: RealtimeDeps): Realtime {
  const io = new Server(server, { path: "/socket.io", serveClient: false });

  let pub: Redis | null = null;
  let sub: Redis | null = null;
  if (deps.redis) {
    pub = deps.redis.duplicate();
    sub = deps.redis.duplicate();
    io.adapter(createAdapter(pub, sub));
  }

  // `of()` is typed with the server-wide event maps; each namespace has its own contract.
  const host = io.of(WS_NAMESPACES.host) as unknown as HostNamespace;
  const play = io.of(WS_NAMESPACES.play) as unknown as PlayNamespace;
  registerHostNamespace(host, { games: deps.games, verifyHost: deps.verifyHost, log: deps.log });
  let closing = false;
  registerPlayNamespace(play, {
    games: deps.games,
    log: deps.log,
    isClosing: () => closing,
    ...(deps.joinLimiter ? { joinLimiter: deps.joinLimiter } : {}),
  });
  deps.notifier.bind(host, play);

  return {
    io,
    async close() {
      // Server-side disconnects at shutdown are not player disconnects (restoreTimers marks
      // everybody disconnected at the next start); the Redis adapter may already be closing.
      closing = true;
      io.disconnectSockets(true);
      io.engine.close();
      await Promise.allSettled([pub?.quit(), sub?.quit()]);
    },
  };
}
