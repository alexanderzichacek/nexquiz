import {
  playerAnswerPayloadSchema,
  playerJoinPayloadSchema,
  playerRejoinPayloadSchema,
  playHandshakeAuthSchema,
} from "@nexquiz/shared";
import { clientIp } from "../clientIp.js";
import { AppError } from "../errors.js";
import type { GameService } from "../game/GameService.js";
import type { GameLogger } from "../game/ports.js";
import { FixedWindowLimiter } from "./rateLimit.js";
import { parsePayload, respond, splitArgs, toErrorResponse } from "./respond.js";
import { gameRoom, playerRoom, type PlayNamespace, type PlaySocket } from "./types.js";

/** `player:join` max. 10 / min / IP. */
export const JOIN_LIMIT = { max: 10, windowMs: 60_000 } as const;

export interface PlayNamespaceDeps {
  games: GameService;
  log: GameLogger;
  joinLimiter?: FixedWindowLimiter;
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
        if (!limiter.hit(socket.data.ip)) throw new AppError("RATE_LIMITED");
        const { pin, nickname } = parsePayload(playerJoinPayloadSchema, payload);
        samePin(socket, pin);
        assertBindable(socket);
        const joined = await games.join(pin, nickname);
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
