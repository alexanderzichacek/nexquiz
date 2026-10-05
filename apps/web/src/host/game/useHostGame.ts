import type { HostOverridePayload, OkOrErrorAck } from "@nexquiz/shared";
import { onBeforeUnmount, ref, shallowRef } from "vue";
import { ACK_TIMEOUT_MS, connectHost, type HostClientSocket } from "@/lib/socket";
import {
  fromHostState,
  onFinished,
  onLeaderboard,
  onLobbyPlayers,
  onProgress,
  onQuestionEnd,
  onQuestionStart,
  onReveal,
  type HostView,
} from "./hostState";

export type HostGameStatus = "connecting" | "ready" | "notFound" | "unauthorized" | "error";

/** Retry delay of `host:attach` after an ack timeout. */
const ATTACH_RETRY_MS = 2000;

type Reducer = (v: HostView) => HostView;

/**
 * Host game screen connection: `/host` socket, `host:attach` on every
 * (re)connect (the ack is the complete `HostGameState`), live events applied
 * through the pure reducers in `hostState.ts`, and the host intents.
 */
export function useHostGame(pin: string) {
  const view = shallowRef<HostView | null>(null);
  const status = ref<HostGameStatus>("connecting");
  const connected = ref(false);

  const socket: HostClientSocket = connectHost();
  /** Events received while an attach is in flight are applied on top of its snapshot. */
  let attaching = false;
  let buffered: Reducer[] = [];
  let retryTimer: number | null = null;

  function apply(reducer: Reducer): void {
    if (attaching) {
      buffered.push(reducer);
      return;
    }
    if (view.value) view.value = reducer(view.value);
  }

  async function attach(): Promise<void> {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    retryTimer = null;
    attaching = true;
    buffered = [];
    try {
      const ack = await socket.timeout(ACK_TIMEOUT_MS).emitWithAck("host:attach", { pin });
      if ("error" in ack) {
        status.value = ack.error === "PIN_NOT_FOUND" ? "notFound" : "error";
        return;
      }
      let next = fromHostState(ack);
      for (const reducer of buffered) next = reducer(next);
      view.value = next;
      status.value = "ready";
    } catch {
      // Ack timeout – try again while the socket is up.
      if (socket.connected) retryTimer = window.setTimeout(() => void attach(), ATTACH_RETRY_MS);
    } finally {
      attaching = false;
      buffered = [];
    }
  }

  socket.on("connect", () => {
    connected.value = true;
    void attach();
  });
  socket.on("disconnect", () => {
    connected.value = false;
  });
  socket.on("connect_error", (err) => {
    connected.value = false;
    // The namespace middleware rejects a missing / expired host session.
    if (err.message === "UNAUTHORIZED") status.value = "unauthorized";
  });

  socket.on("lobby:players", (e) => apply((v) => onLobbyPlayers(v, e)));
  socket.on("question:start", (e) => {
    const localNow = Date.now();
    apply((v) => onQuestionStart(v, e, localNow));
  });
  socket.on("question:progress", (e) => apply((v) => onProgress(v, e)));
  socket.on("question:end", (e) => apply((v) => onQuestionEnd(v, e)));
  socket.on("question:reveal", (e) => apply((v) => onReveal(v, e)));
  socket.on("leaderboard", (e) => apply((v) => onLeaderboard(v, e)));
  socket.on("game:finished", (e) => apply((v) => onFinished(v, e)));
  socket.on("game:state", (s) => {
    view.value = fromHostState(s);
    status.value = "ready";
  });

  onBeforeUnmount(() => {
    if (retryTimer !== null) window.clearTimeout(retryTimer);
    socket.removeAllListeners();
    socket.disconnect();
  });

  /** Sends an intent; resolves `true` on `{ ok: true }`. */
  async function send(run: () => Promise<OkOrErrorAck>): Promise<boolean> {
    try {
      const ack = await run();
      return "ok" in ack;
    } catch {
      return false;
    }
  }

  const timed = () => socket.timeout(ACK_TIMEOUT_MS);

  return {
    view,
    status,
    connected,
    start: () => send(() => timed().emitWithAck("host:start")),
    next: () => send(() => timed().emitWithAck("host:next")),
    endQuestion: () => send(() => timed().emitWithAck("host:end_question")),
    end: () => send(() => timed().emitWithAck("host:end")),
    kick: (playerId: string) => send(() => timed().emitWithAck("host:kick", { playerId })),
    override: (payload: HostOverridePayload) => send(() => timed().emitWithAck("host:override", payload)),
  };
}

export type HostGame = ReturnType<typeof useHostGame>;
