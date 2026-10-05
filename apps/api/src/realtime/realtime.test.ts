import type { AddressInfo } from "node:net";
import {
  type HostClientToServerEvents,
  type HostServerToClientEvents,
  type PlayClientToServerEvents,
  type PlayServerToClientEvents,
} from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";
import { io as connect, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../app.js";
import { loadConfig } from "../config.js";
import { GameService } from "../game/GameService.js";
import { TimerScheduler } from "../game/scheduler.js";
import { hostCookieVerifier, SESSION_COOKIE } from "../rest/session.js";
import { MemoryGameStore } from "../store/memoryGameStore.js";
import { fakeAppServices, FakePersistence, IMAGE_ID, QUIZ_ID, sampleQuiz, silentLog } from "../test/helpers.js";
import { attachRealtime, type Realtime } from "./index.js";
import { SocketNotifier } from "./notifier.js";
import { FixedWindowLimiter } from "./rateLimit.js";

type HostClient = Socket<HostServerToClientEvents, HostClientToServerEvents>;
type PlayClient = Socket<PlayServerToClientEvents, PlayClientToServerEvents>;

const config = loadConfig({
  DATABASE_URL: "postgres://quiz:secret@db:5432/quiz",
  REDIS_URL: "redis://redis:6379",
  ADMIN_PASSWORD: "admin-pass",
  SESSION_SECRET: "r".repeat(40),
});

let app: FastifyInstance;
let realtime: Realtime;
let baseUrl: string;
let cookie: string;
const sockets: Socket[] = [];

function track<T extends Socket>(socket: T): T {
  sockets.push(socket);
  return socket;
}

function hostClient(withCookie = true): HostClient {
  return track(
    connect(`${baseUrl}/host`, {
      transports: ["websocket"],
      forceNew: true,
      extraHeaders: withCookie ? { cookie } : {},
    }),
  );
}

function playClient(auth: object): PlayClient {
  return track(connect(`${baseUrl}/play`, { transports: ["websocket"], forceNew: true, auth: { ...auth } }));
}

function connectError(socket: Socket): Promise<string> {
  return new Promise((resolve) => socket.once("connect_error", (err) => resolve(err.message)));
}

function connected(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("connect", () => resolve());
    socket.once("connect_error", reject);
  });
}

/** Next occurrence of a server event. */
function next<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve) => socket.once(event, (payload: T) => resolve(payload)));
}

async function createGame(): Promise<string> {
  const res = await app.inject({ method: "POST", url: "/api/games", headers: { cookie }, payload: { quizId: QUIZ_ID } });
  return res.json<{ pin: string }>().pin;
}

beforeAll(async () => {
  const notifier = new SocketNotifier();
  const quiz = sampleQuiz({ speedBonus: false });
  const games = new GameService({
    store: new MemoryGameStore(),
    persistence: new FakePersistence(),
    quizzes: { loadForSnapshot: async () => ({ quiz, images: { [IMAGE_ID]: { width: 100, height: 100 } } }) },
    notifier,
    scheduler: new TimerScheduler(),
    log: silentLog,
  });
  app = await buildApp({
    config,
    publicDir: "/nonexistent",
    logLevel: "silent",
    db: { db: {} as never, ping: async () => true, close: async () => undefined },
    redis: { redis: {} as never, ping: async () => true, close: async () => undefined },
    services: () => fakeAppServices(games),
  });
  realtime = attachRealtime(app.server, {
    games,
    notifier,
    verifyHost: hostCookieVerifier(app),
    log: silentLog,
    joinLimiter: new FixedWindowLimiter(10, 60_000),
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;

  const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "admin-pass" } });
  const header = login.headers["set-cookie"];
  const raw = (Array.isArray(header) ? header : [header ?? ""]).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  cookie = raw?.split(";")[0] ?? "";
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await realtime.close();
  await app.close();
});

describe("realtime handshake", () => {
  it("/host requires the session cookie", async () => {
    expect(await connectError(hostClient(false))).toBe("UNAUTHORIZED");
  });

  it("/play requires auth { pin }", async () => {
    expect(await connectError(playClient({ pin: "12" }))).toBe("INVALID");
  });
});

describe("realtime game flow", () => {
  it("runs join → question → answer → reveal → rejoin → kick → finish", async () => {
    const pin = await createGame();
    const host = hostClient();
    await connected(host);
    const attached = await host.timeout(2000).emitWithAck("host:attach", { pin });
    expect(attached).toMatchObject({ role: "host", pin, state: "LOBBY", currentIndex: -1, players: [] });

    const player = playClient({ pin });
    await connected(player);
    const lobby = next<{ players: { nickname: string }[] }>(host, "lobby:players");
    const initialState = next<{ role: string; state: string }>(player, "game:state");
    const joined = await player.timeout(2000).emitWithAck("player:join", { pin, nickname: "Alice" });
    if (!("token" in joined)) throw new Error(`join failed: ${JSON.stringify(joined)}`);
    expect((await lobby).players.map((p) => p.nickname)).toEqual(["Alice"]);
    expect(await initialState).toMatchObject({ role: "player", state: "LOBBY" });
    // One socket = one player: a second join on the same socket is rejected.
    expect(await player.timeout(2000).emitWithAck("player:join", { pin, nickname: "Bob" })).toEqual({ error: "INVALID" });

    const other = playClient({ pin });
    await connected(other);
    expect(await other.timeout(2000).emitWithAck("player:join", { pin, nickname: "alice" })).toEqual({ error: "NICK_TAKEN" });
    expect(await other.timeout(2000).emitWithAck("player:join", { pin: "000000", nickname: "Zed" })).toEqual({
      error: "INVALID",
    });
    other.disconnect();

    const started = next<Record<string, unknown>>(player, "question:start");
    expect(await host.timeout(2000).emitWithAck("host:start")).toEqual({ ok: true });
    const question = await started;
    expect(question).toMatchObject({ index: 0, type: "single" });
    expect(JSON.stringify(question)).not.toContain("correctId");

    const ended = next<{ index: number }>(player, "question:end");
    const result = next<{ correctness: number; points: number; rank: number }>(player, "player:result");
    const reveal = next<{ index: number }>(host, "question:reveal");
    expect(
      await player.timeout(2000).emitWithAck("player:answer", { questionIndex: 0, payload: { optionId: "b" } }),
    ).toEqual({ ok: true });
    // The only connected player answered → automatic reveal.
    expect(await ended).toEqual({ index: 0 });
    expect(await result).toMatchObject({ correctness: 1, points: 1, rank: 1 });
    expect(await reveal).toMatchObject({ index: 0, correct: { type: "single", correctId: "b" } });
    expect(
      await player.timeout(2000).emitWithAck("player:answer", { questionIndex: 0, payload: { optionId: "b" } }),
    ).toEqual({ error: "LATE" });

    // Reconnect (e.g. locked phone) with the stored token.
    const again = playClient({ pin, token: joined.token });
    await connected(again);
    const rejoined = await again.timeout(2000).emitWithAck("player:rejoin", { pin, token: joined.token });
    expect(rejoined).toMatchObject({ role: "player", state: "REVEAL", hasAnswered: true, score: 1, rank: 1 });
    expect(await again.timeout(2000).emitWithAck("player:rejoin", { pin, token: `${joined.playerId}.forged-token` })).toEqual({
      error: "INVALID_TOKEN",
    });

    const kicked = next<undefined>(again, "player:kicked");
    expect(await host.timeout(2000).emitWithAck("host:kick", { playerId: joined.playerId })).toEqual({ ok: true });
    await kicked;

    const finished = next<{ podium: unknown[] }>(host, "game:finished");
    expect(await host.timeout(2000).emitWithAck("host:end")).toEqual({ ok: true });
    expect((await finished).podium).toEqual([]);
    expect(await host.timeout(2000).emitWithAck("host:next")).toEqual({ error: "INVALID_TRANSITION" });
  });

  it("rejects host commands before host:attach and invalid payloads", async () => {
    const host = hostClient();
    await connected(host);
    expect(await host.timeout(2000).emitWithAck("host:start")).toEqual({ error: "INVALID" });
    expect(await host.timeout(2000).emitWithAck("host:attach", { pin: "abc" })).toEqual({ error: "INVALID" });
    expect(await host.timeout(2000).emitWithAck("host:attach", { pin: "999999" })).toEqual({ error: "PIN_NOT_FOUND" });
  });

  it("rate limits player:join per IP", async () => {
    const pin = await createGame();
    const player = playClient({ pin });
    await connected(player);
    const acks: unknown[] = [];
    for (let i = 0; i < 12; i++) acks.push(await player.timeout(2000).emitWithAck("player:join", { pin, nickname: "" }));
    expect(acks.at(-1)).toEqual({ error: "RATE_LIMITED" });
  });
});
