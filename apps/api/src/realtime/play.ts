import {
  playerAnswerPayloadSchema,
  playerJoinPayloadSchema,
  playerRejoinPayloadSchema,
  playHandshakeAuthSchema,
} from "@nexquiz/shared";
import { clientIp } from "../clientIp.js";
import { AppError, isAppError } from "../errors.js";
import type { GameService } from "../game/GameService.js";
import type { GameLogger } from "../game/ports.js";
import { FixedWindowLimiter } from "./rateLimit.js";
import { parsePayload, respond, splitArgs, toErrorResponse } from "./respond.js";
import { gameRoom, playerRoom, type PlayNamespace, type PlaySocket } from "./types.js";

/**
 * `player:join` per IP + PIN: a whole classroom behind one NAT fills one game
 * (200 players + nickname retries + reloads), every game has its own budget.
 * Overridden by `JOIN_RATE_LIMIT_PER_MIN`.
 */
export const JOIN_LIMIT = { max: 400, windowMs: 60_000 } as const;

/**
 * `player:join` attempts for an unknown PIN per IP. The IP + PIN key alone
 * would let one IP probe unlimited PINs; after this many misses the IP gets
 * `RATE_LIMITED` for every join until the window ends.
 */
export const JOIN_MISS_LIMIT = { max: 30, windowMs: 60_000 } as const;

/** Key of the `player:join` limiter. */
export function joinLimitKey(ip: string, pin: string): string {
  return `${ip}|${pin}`;
}

export interface PlayNamespaceDeps {
  games: GameService;
  log: GameLogger;
  /** Keyed by `joinLimitKey(ip, pin)`. */
  joinLimiter?: FixedWindowLimiter;
  /** Keyed by IP, counts joins that ended with `PIN_NOT_FOUND`. */
  joinMissLimiter?: FixedWindowLimiter;
  /** True while the server shuts down: disconnects are then not recorded. */
  isClosing?: () => boolean;
}

/**
 * One socket = one player: a socket already bound to a player cannot join
 * again or rejoin as somebody else (the first player would stay
 * "connected" without a socket and block the auto-end of questions).
 */
function assertBindable(socket: PlaySocket, playerId?: string): void {
  const bound = socket.data.playerId;
  if (bound !== undefined && bound !== playerId) throw new AppError("INVALID");
}

async function bindPlayer(socket: PlaySocket, playerId: string): Promise<void> {
  const { pin } = socket.data;
  assertBindable(socket, playerId);
  socket.data.playerId = playerId;
  await socket.join([gameRoom(pin), playerRoom(pin, playerId)]);
}

function samePin(socket: PlaySocket, pin: string): void {
  if (pin !== socket.data.pin) throw new AppError("INVALID");
}

/** `/play` namespace: handshake `auth: { pin, token? }`; handlers only delegate to `GameService`. */
export function registerPlayNamespace(nsp: PlayNamespace, deps: PlayNamespaceDeps): void {
  const { games, log } = deps;
  const limiter = deps.joinLimiter ?? new FixedWindowLimiter(JOIN_LIMIT.max, JOIN_LIMIT.windowMs);
  const missLimiter = deps.joinMissLimiter ?? new FixedWindowLimiter(JOIN_MISS_LIMIT.max, JOIN_MISS_LIMIT.windowMs);

  nsp.use((socket, next) => {
    const auth = playHandshakeAuthSchema.safeParse(socket.handshake.auth);
    if (!auth.success) {
      next(new Error("INVALID"));
      return;
    }
    socket.data.pin = auth.data.pin;
    socket.data.ip = clientIp(socket.handshake.headers, socket.handshake.address);
    next();
  });

  nsp.on("connection", (socket) => {
    const ctx = () => ({ pin: socket.data.pin, playerId: socket.data.playerId, socketId: socket.id, role: "player" });

    socket.on("player:join", (...args: unknown[]) => {
      const { payload, ack } = splitArgs(args);
      const run = async () => {
        const { ip } = socket.data;
        // The miss check comes first, so a blocked IP cannot add new IP + PIN keys either.
        if (missLimiter.isLimited(ip) || !limiter.hit(joinLimitKey(ip, socket.data.pin))) {
          throw new AppError("RATE_LIMITED");
        }
        const { pin, nickname, avatar } = parsePayload(playerJoinPayloadSchema, payload);
        samePin(socket, pin);
        assertBindable(socket);
        const joined = await games.join(pin, nickname, avatar).catch((err: unknown) => {
          if (isAppError(err) && err.code === "PIN_NOT_FOUND") missLimiter.hit(ip);
          throw err;
        });
        await bindPlayer(socket, joined.playerId);
        return joined;
      };
      run().then(
        async (joined) => {
          ack(joined);
          // Late join: the new player immediately gets the current phase / question.
          socket.emit("game:state", await games.getPlayerState(socket.data.pin, joined.playerId));
        },
        (err: unknown) => ack(toErrorResponse(err, log, ctx())),
      ).catch((err: unknown) => log.error({ err, ...ctx() }, "sending game state failed"));
    });

    socket.on("player:rejoin", (...args: unknown[]) =>
      respond(args, log, ctx(), async (payload) => {
        const { pin, token } = parsePayload(playerRejoinPayloadSchema, payload);
        samePin(socket, pin);
        const state = await games.rejoin(pin, token, socket.data.playerId);
        await bindPlayer(socket, state.playerId);
        return state;
      }),
    );

    socket.on("player:answer", (...args: unknown[]) => {
      // Server receive time – the only clock used for answers.
      const receivedAt = games.serverNow();
      respond(args, log, ctx(), async (payload) => {
        const playerId = socket.data.playerId;
        if (!playerId) return { error: "INVALID" };
        const parsed = playerAnswerPayloadSchema.safeParse(payload);
        if (!parsed.success) return { error: "INVALID" };
        return games.submitAnswer(socket.data.pin, playerId, parsed.data.questionIndex, parsed.data.payload, receivedAt);
      });
    });

    socket.on("disconnect", () => {
      const { pin, playerId } = socket.data;
      if (!playerId || deps.isClosing?.()) return;
      // The player may still be connected from another tab / device.
      nsp
        .in(playerRoom(pin, playerId))
        .fetchSockets()
        .then((remaining) => (remaining.length === 0 ? games.setConnected(pin, playerId, false) : undefined))
        .catch((err: unknown) => log.error({ err, pin, playerId }, "disconnect handling failed"));
    });
  });
}
