import {
  pinSchema,
  type AnswerPayload,
  type Avatar,
  type ErrorCode,
  type PlayHandshakeAuth,
} from "@nexquiz/shared";
import { onBeforeUnmount, ref, shallowRef } from "vue";
import { checkPin, pinCheckMessage, takeConfirmedPin } from "@/lib/pinCheck";
import { clearToken, loadToken, saveToken } from "@/lib/playerToken";
import { ACK_TIMEOUT_MS, connectPlay, type PlayClientSocket } from "@/lib/socket";
import {
  fromPlayerState,
  onExplanationShow,
  onFinished,
  onLeaderboard,
  onPageShow,
  onPlayerResult,
  onQuestionEnd,
  onQuestionStart,
  setAnswered,
  type PlayView,
} from "./playState";

/**
 * Player screen phases: PIN check → nickname → in game. `invalid` = unknown
 * or inactive PIN, `checkFailed` = the PIN check was rate limited or the
 * server was unreachable (`checkError`, the player can retry), `kicked` =
 * removed by the host.
 */
export type PlayPhase = "checking" | "invalid" | "checkFailed" | "nickname" | "game" | "kicked";

export type JoinError = "NICK_TAKEN" | "GAME_FINISHED" | "RATE_LIMITED" | "INVALID" | "NETWORK";

export type AnswerOutcome = "ok" | "late" | "already" | "error";

type Reducer = (v: PlayView) => PlayView;

/**
 * Player connection: `/play` socket with `auth: { pin, token? }`,
 * `player:join` / `player:rejoin` (token in `localStorage` `nexquiz:{pin}`),
 * `game:state` snapshots and live events through the reducers in `playState.ts`.
 */
export function usePlayGame(pin: string) {
  const phase = ref<PlayPhase>("checking");
  const view = shallowRef<PlayView | null>(null);
  /** True while the socket is connected (the ConnectionBadge shows the opposite). */
  const connected = ref(false);
  /** The socket was connected at least once (no badge before the first connect). */
  const everConnected = ref(false);
  /** Message of the `checkFailed` phase. */
  const checkError = ref<string | null>(null);

  let socket: PlayClientSocket | null = null;

  function apply(reducer: Reducer): void {
    if (view.value) view.value = reducer(view.value);
  }

  function setState(next: PlayView): void {
    view.value = next;
    phase.value = "game";
  }

  /**
   * `/exists` → nickname step, `invalid` only when the game really does not
   * exist; a 429 / network error → `checkFailed` with a retry. Returns true
   * when the game exists.
   */
  async function checkGame(): Promise<boolean> {
    const result = await checkPin(pin);
    if (result === "exists") {
      phase.value = "nickname";
      return true;
    }
    if (result === "missing") {
      phase.value = "invalid";
    } else {
      checkError.value = pinCheckMessage(result);
      phase.value = "checkFailed";
    }
    return false;
  }

  /** Rejoin failed (unknown / kicked token): forget it and fall back to the nickname step. */
  async function dropToken(code: ErrorCode): Promise<void> {
    clearToken(pin);
    if (code === "PIN_NOT_FOUND") {
      phase.value = "invalid";
      return;
    }
    await checkGame();
  }

  async function rejoin(token: string): Promise<void> {
    const s = socket;
    if (!s) return;
    try {
      const ack = await s.timeout(ACK_TIMEOUT_MS).emitWithAck("player:rejoin", { pin, token });
      if ("error" in ack) {
        if (ack.error === "INVALID_TOKEN" || ack.error === "PIN_NOT_FOUND") await dropToken(ack.error);
        return;
      }
      setState(fromPlayerState(ack));
    } catch {
      // Ack timeout – Socket.IO reconnects and `connect` retries the rejoin.
      if (s.connected) s.disconnect().connect();
    }
  }

  function connect(): void {
    if (socket) return;
    const s = connectPlay((): PlayHandshakeAuth => {
      const token = loadToken(pin);
      return token ? { pin, token } : { pin };
    });
    socket = s;

    s.on("connect", () => {
      connected.value = true;
      everConnected.value = true;
      const token = loadToken(pin);
      if (token) void rejoin(token);
    });
    s.on("disconnect", () => {
      connected.value = false;
    });
    s.on("connect_error", () => {
      connected.value = false;
    });

    s.on("game:state", (state) => setState(fromPlayerState(state)));
    s.on("question:start", (e) => {
      const localNow = Date.now();
      apply((v) => onQuestionStart(v, e, localNow));
    });
    s.on("page:show", (e) => apply((v) => onPageShow(v, e)));
    s.on("explanation:show", (e) => apply((v) => onExplanationShow(v, e)));
    s.on("question:end", (e) => apply((v) => onQuestionEnd(v, e)));
    s.on("player:result", (e) => apply((v) => onPlayerResult(v, e)));
    s.on("leaderboard", (e) => apply((v) => onLeaderboard(v, e)));
    s.on("game:finished", (e) => apply((v) => onFinished(v, e)));
    s.on("player:kicked", () => {
      clearToken(pin);
      phase.value = "kicked";
      s.disconnect();
    });
  }

  async function start(): Promise<void> {
    if (!pinSchema.safeParse(pin).success) {
      phase.value = "invalid";
      return;
    }
    if (loadToken(pin)) {
      // Reconnect after a reload / locked phone: the rejoin on `connect` restores the game.
      connect();
      return;
    }
    // Coming from the landing page, which has just confirmed the PIN: no second `/exists`.
    if (takeConfirmedPin(pin)) {
      phase.value = "nickname";
      connect();
      return;
    }
    phase.value = "checking";
    checkError.value = null;
    if (await checkGame()) connect();
  }

  /** `player:join`; on success the server sends `game:state`. Returns an error code or null. */
  async function join(nickname: string, avatar: Avatar): Promise<JoinError | null> {
    const s = socket;
    if (!s || !s.connected) return "NETWORK";
    try {
      const ack = await s.timeout(ACK_TIMEOUT_MS).emitWithAck("player:join", { pin, nickname, avatar });
      if ("error" in ack) {
        if (ack.error === "PIN_NOT_FOUND") {
          phase.value = "invalid";
          return null;
        }
        if (ack.error === "NICK_TAKEN" || ack.error === "GAME_FINISHED" || ack.error === "RATE_LIMITED") return ack.error;
        return "INVALID";
      }
      saveToken(pin, ack.token);
      return null;
    } catch {
      return "NETWORK";
    }
  }

  /** `player:answer` with an optimistic „Odpoveď odoslaná“ (reverted when the server rejects it). */
  async function answer(questionIndex: number, payload: AnswerPayload): Promise<AnswerOutcome> {
    const s = socket;
    apply((v) => setAnswered(v, questionIndex, true));
    if (!s || !s.connected) {
      apply((v) => setAnswered(v, questionIndex, false));
      return "error";
    }
    try {
      const ack = await s.timeout(ACK_TIMEOUT_MS).emitWithAck("player:answer", { questionIndex, payload });
      if ("ok" in ack) return "ok";
      if (ack.error === "ALREADY_ANSWERED") return "already";
      apply((v) => setAnswered(v, questionIndex, false));
      return ack.error === "LATE" ? "late" : "error";
    } catch {
      apply((v) => setAnswered(v, questionIndex, false));
      return "error";
    }
  }

  onBeforeUnmount(() => {
    socket?.removeAllListeners();
    socket?.disconnect();
    socket = null;
  });

  return { phase, view, connected, everConnected, checkError, start, join, answer };
}

export type PlayGame = ReturnType<typeof usePlayGame>;
