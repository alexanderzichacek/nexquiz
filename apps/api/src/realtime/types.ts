import type {
  HostClientToServerEvents,
  HostServerToClientEvents,
  PlayClientToServerEvents,
  PlayServerToClientEvents,
} from "@nexquiz/shared";
import type { DefaultEventsMap, Namespace, Socket } from "socket.io";

export interface HostSocketData {
  /** PIN of the game this host socket is attached to (`host:attach`). */
  pin?: string;
}

export interface PlaySocketData {
  /** PIN from the handshake `auth`. */
  pin: string;
  /** Set after `player:join` / `player:rejoin`. */
  playerId?: string;
  ip: string;
}

export type HostNamespace = Namespace<HostClientToServerEvents, HostServerToClientEvents, DefaultEventsMap, HostSocketData>;
export type HostSocket = Socket<HostClientToServerEvents, HostServerToClientEvents, DefaultEventsMap, HostSocketData>;
export type PlayNamespace = Namespace<PlayClientToServerEvents, PlayServerToClientEvents, DefaultEventsMap, PlaySocketData>;
export type PlaySocket = Socket<PlayClientToServerEvents, PlayServerToClientEvents, DefaultEventsMap, PlaySocketData>;

/** Room of everybody in a game (exists in both namespaces). */
export const gameRoom = (pin: string): string => `game:${pin}`;
/** Room of the host screen(s) of a game (`/host`). */
export const hostRoom = (pin: string): string => `game:${pin}:host`;
/** Private room of one player (all their sockets, works across instances). */
export const playerRoom = (pin: string, playerId: string): string => `game:${pin}:player:${playerId}`;
