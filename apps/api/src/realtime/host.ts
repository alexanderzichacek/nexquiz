import { hostAttachPayloadSchema, hostKickPayloadSchema, hostOverridePayloadSchema } from "@nexquiz/shared";
import { AppError } from "../errors.js";
import type { GameService } from "../game/GameService.js";
import type { GameLogger } from "../game/ports.js";
import { OK, parsePayload, respond } from "./respond.js";
import { gameRoom, hostRoom, type HostNamespace, type HostSocket } from "./types.js";

export interface HostNamespaceDeps {
  games: GameService;
  /** Verifies the session cookie from the handshake `Cookie` header. */
  verifyHost: (cookieHeader: string | undefined) => boolean;
  log: GameLogger;
}

function attachedPin(socket: HostSocket): string {
  const pin = socket.data.pin;
  if (!pin) throw new AppError("INVALID");
  return pin;
}

/** `/host` namespace: handshake requires the host session; handlers only delegate to `GameService`. */
export function registerHostNamespace(nsp: HostNamespace, deps: HostNamespaceDeps): void {
  const { games, log } = deps;

  nsp.use((socket, next) => {
    if (deps.verifyHost(socket.handshake.headers.cookie)) next();
    else next(new Error("UNAUTHORIZED"));
  });

  nsp.on("connection", (socket) => {
    const ctx = () => ({ pin: socket.data.pin, socketId: socket.id, role: "host" });

    socket.on("host:attach", (...args: unknown[]) =>
      respond(args, log, ctx(), async (payload) => {
        const { pin } = parsePayload(hostAttachPayloadSchema, payload);
        const state = await games.attachHost(pin);
        const previous = socket.data.pin;
        if (previous && previous !== pin) {
          await socket.leave(gameRoom(previous));
          await socket.leave(hostRoom(previous));
        }
        socket.data.pin = pin;
        await socket.join([gameRoom(pin), hostRoom(pin)]);
        return state;
      }),
    );

    socket.on("host:start", (...args: unknown[]) =>
      respond(args, log, ctx(), async () => {
        await games.start(attachedPin(socket));
        return OK;
      }),
    );

    socket.on("host:next", (...args: unknown[]) =>
      respond(args, log, ctx(), async () => {
        await games.next(attachedPin(socket));
        return OK;
      }),
    );

    socket.on("host:end_question", (...args: unknown[]) =>
      respond(args, log, ctx(), async () => {
        await games.endQuestion(attachedPin(socket));
        return OK;
      }),
    );

    socket.on("host:override", (...args: unknown[]) =>
      respond(args, log, ctx(), async (payload) => {
        await games.override(attachedPin(socket), parsePayload(hostOverridePayloadSchema, payload));
        return OK;
      }),
    );

    socket.on("host:kick", (...args: unknown[]) =>
      respond(args, log, ctx(), async (payload) => {
        const { playerId } = parsePayload(hostKickPayloadSchema, payload);
        await games.kick(attachedPin(socket), playerId);
        return OK;
      }),
    );

    socket.on("host:end", (...args: unknown[]) =>
      respond(args, log, ctx(), async () => {
        await games.end(attachedPin(socket));
        return OK;
      }),
    );
  });
}
