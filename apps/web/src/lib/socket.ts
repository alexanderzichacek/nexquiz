import {
  WS_NAMESPACES,
  type HostClientToServerEvents,
  type HostServerToClientEvents,
  type PlayClientToServerEvents,
  type PlayHandshakeAuth,
  type PlayServerToClientEvents,
} from "@nexquiz/shared";
import { io, type Socket } from "socket.io-client";

/** Typed Socket.IO clients (contract in `packages/shared/src/schemas/ws.ts`). */
export type HostClientSocket = Socket<HostServerToClientEvents, HostClientToServerEvents>;
export type PlayClientSocket = Socket<PlayServerToClientEvents, PlayClientToServerEvents>;

/** How long an emit waits for its ack before it is treated as failed. */
export const ACK_TIMEOUT_MS = 8000;

const PATH = "/socket.io";

/** `/host` namespace – the handshake carries the session cookie (same origin). */
export function connectHost(): HostClientSocket {
  return io(WS_NAMESPACES.host, { path: PATH, withCredentials: true });
}

/**
 * `/play` namespace with `auth: { pin, token? }`. `auth` is read on every
 * (re)connect, so a token stored after `player:join` is used for reconnects.
 */
export function connectPlay(auth: () => PlayHandshakeAuth): PlayClientSocket {
  return io(WS_NAMESPACES.play, {
    path: PATH,
    auth: (cb) => cb(auth()),
  });
}
