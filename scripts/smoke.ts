/**
 * End-to-end smoke test against a running NexQuiz stack (REST + Socket.IO).
 *
 *   docker compose --profile smoke run --rm smoke          # against the compose `api`
 *   ADMIN_PASSWORD=… SMOKE_BASE_URL=http://localhost:3000 npm run smoke
 *
 * Creates a quiz with one question of every type (generated PNG + MP3),
 * plays it with a host and two players (one always right, one always wrong)
 * and checks secrets, duplicate / late answers, a host override, rejoin,
 * history and the CSV export. Exits with code 1 on the first failure.
 * The created quiz is deleted at the end (`SMOKE_KEEP_QUIZ=1` keeps it);
 * the finished game stays in the history.
 */
import { randomUUID } from "node:crypto";
import {
  createGameResponseSchema,
  gameExistsResponseSchema,
  gameFinishedEventSchema,
  gameHistoryResponseSchema,
  gameResultsResponseSchema,
  healthResponseSchema,
  hostGameStateSchema,
  leaderboardEventSchema,
  lobbyPlayersEventSchema,
  mediaUploadResponseSchema,
  okOrErrorAckSchema,
  playerAnswerAckSchema,
  playerGameStateSchema,
  playerJoinAckSchema,
  playerResultEventSchema,
  questionEndEventSchema,
  questionProgressEventSchema,
  questionRevealEventSchema,
  questionStartEventSchema,
  quizDtoSchema,
  type Question,
  type QuestionStartEvent,
  type QuizUpdateRequest,
} from "@nexquiz/shared";
import { io, type Socket } from "socket.io-client";
import { z } from "zod";
import { generateMp3, generatePng } from "./media.js";

const BASE_URL = (process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const ADMIN_PASSWORD = process.env.SMOKE_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";
const KEEP_QUIZ = process.env.SMOKE_KEEP_QUIZ === "1";
const WAIT_MS = 15_000;

/** Keys that must never reach a client before the reveal. */
const SECRET_KEYS = ["correctId", "correctIds", "targets", "accepted"];

// ---------------------------------------------------------------------------
// Tiny test harness
// ---------------------------------------------------------------------------

let passed = 0;

class SmokeFailure extends Error {}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new SmokeFailure(message);
}

function equal<T>(actual: T, expected: T, message: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new SmokeFailure(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

function ok(message: string): void {
  passed++;
  console.log(`  ok  ${message}`);
}

function section(title: string): void {
  console.log(`\n# ${title}`);
}

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new SmokeFailure(`${what} has an unexpected shape: ${result.error.message} – ${JSON.stringify(value)}`);
  }
  return result.data;
}

/** All object keys anywhere inside `value`. */
function deepKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) deepKeys(item, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, inner] of Object.entries(value)) {
      out.add(key);
      deepKeys(inner, out);
    }
  }
  return out;
}

const checkedQuestionPayloads = { count: 0 };

/** Fails when a question payload sent to a client contains an answer secret. */
function assertNoSecrets(raw: unknown, where: string, role: "host" | "player"): void {
  const keys = deepKeys(raw);
  const leaked = SECRET_KEYS.filter((k) => keys.has(k));
  assert(leaked.length === 0, `${where} leaks ${leaked.join(", ")}`);
  if (role === "player") assert(!keys.has("audioId"), `${where} sends audioId to a player`);
  checkedQuestionPayloads.count++;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

let cookie = "";

async function http(
  path: string,
  init: { method?: string; json?: unknown; body?: FormData; auth?: boolean; headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers: Record<string, string> = { ...init.headers };
  if (init.auth !== false && cookie) headers.cookie = cookie;
  let body: string | FormData | undefined = init.body;
  if (init.json !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(init.json);
  }
  return fetch(`${BASE_URL}${path}`, { method: init.method ?? "GET", headers, body, redirect: "manual" });
}

async function json(res: Response, expectedStatus: number, what: string): Promise<unknown> {
  const text = await res.text();
  assert(res.status === expectedStatus, `${what}: expected HTTP ${expectedStatus}, got ${res.status} ${text}`);
  return text === "" ? null : (JSON.parse(text) as unknown);
}

async function upload(name: string, mime: string, data: Buffer): Promise<Response> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mime }), name);
  return http("/api/media", { method: "POST", body: form });
}

// ---------------------------------------------------------------------------
// Socket.IO: every received event is recorded, so nothing is missed between awaits
// ---------------------------------------------------------------------------

interface Recorded {
  event: string;
  payload: unknown;
  used: boolean;
}

class Client {
  readonly socket: Socket;
  private readonly events: Recorded[] = [];
  private readonly waiters = new Set<() => void>();

  constructor(
    readonly name: string,
    namespace: "/host" | "/play",
    opts: { auth?: Record<string, string>; cookie?: string },
    private readonly role: "host" | "player",
  ) {
    this.socket = io(`${BASE_URL}${namespace}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      ...(opts.auth ? { auth: opts.auth } : {}),
      ...(opts.cookie ? { extraHeaders: { cookie: opts.cookie } } : {}),
    });
    this.socket.onAny((event: string, ...args: unknown[]) => {
      const payload = args[0];
      if (event === "question:start") assertNoSecrets(payload, `${this.name} question:start`, this.role);
      if (event === "game:state") this.checkState(payload, "game:state");
      this.events.push({ event, payload, used: false });
      for (const wake of this.waiters) wake();
    });
  }

  /** Secrets check of the `question` part of a full state snapshot. */
  checkState(state: unknown, where: string): void {
    if (state !== null && typeof state === "object" && "question" in state && state.question !== null) {
      assertNoSecrets(state.question, `${this.name} ${where}.question`, this.role);
    }
  }

  connected(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) return resolve();
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (err: Error) => reject(new SmokeFailure(`${this.name}: ${err.message}`)));
    });
  }

  connectError(): Promise<string> {
    return new Promise((resolve, reject) => {
      this.socket.once("connect", () => reject(new SmokeFailure(`${this.name} connected unexpectedly`)));
      this.socket.once("connect_error", (err: Error) => resolve(err.message));
    });
  }

  async emit(event: string, ...args: unknown[]): Promise<unknown> {
    return this.socket.timeout(WAIT_MS).emitWithAck(event, ...args);
  }

  /** Next not yet consumed `event` whose payload parses with `schema` and matches `match`. */
  async next<T>(event: string, schema: z.ZodType<T>, match: (payload: T) => boolean = () => true): Promise<T> {
    const deadline = Date.now() + WAIT_MS;
    for (;;) {
      for (const entry of this.events) {
        if (entry.used || entry.event !== event) continue;
        const payload = parse(schema, entry.payload, `${this.name} ${event}`);
        if (match(payload)) {
          entry.used = true;
          return payload;
        }
      }
      const left = deadline - Date.now();
      if (left <= 0) throw new SmokeFailure(`${this.name}: timed out waiting for ${event}`);
      await new Promise<void>((resolve) => {
        const wake = () => {
          clearTimeout(timer);
          this.waiters.delete(wake);
          resolve();
        };
        const timer = setTimeout(wake, left);
        this.waiters.add(wake);
      });
    }
  }

  close(): void {
    this.socket.disconnect();
  }
}

const clients: Client[] = [];

function client(...args: ConstructorParameters<typeof Client>): Client {
  const c = new Client(...args);
  clients.push(c);
  return c;
}

// ---------------------------------------------------------------------------
// Quiz with one question of each type
// ---------------------------------------------------------------------------

const HOTSPOT = { x: 0.75, y: 0.25, r: 0.1 };
const ORDER_IDS = ["mon", "tue", "wed", "thu"];

function buildQuestions(imageId: string, audioId: string): Question[] {
  return [
    {
      id: randomUUID(),
      type: "single",
      prompt: "Hlavné mesto Slovenska?",
      timeLimit: 20,
      points: 1,
      data: {
        options: [
          { id: "ba", text: "Bratislava" },
          { id: "ke", text: "Košice" },
          { id: "za", text: "Žilina" },
        ],
        correctId: "ba",
      },
    },
    {
      id: randomUUID(),
      type: "multi",
      prompt: "Farby slovenskej vlajky?",
      timeLimit: 20,
      points: 2,
      data: {
        options: [
          { id: "red", text: "Červená" },
          { id: "blue", text: "Modrá" },
          { id: "white", text: "Biela" },
          { id: "green", text: "Zelená" },
        ],
        correctIds: ["white", "blue", "red"],
        scoring: "partial",
      },
    },
    {
      id: randomUUID(),
      type: "order",
      prompt: "Zoraď dni v týždni",
      timeLimit: 20,
      points: 1,
      data: {
        items: [
          { id: "mon", text: "Pondelok" },
          { id: "tue", text: "Utorok" },
          { id: "wed", text: "Streda" },
          { id: "thu", text: "Štvrtok" },
        ],
        scoring: "partial",
      },
    },
    {
      id: randomUUID(),
      type: "hotspot",
      prompt: "Ťukni na červený štvorec",
      media: { imageId },
      // Short limit: the question ends by its timer (one player never answers).
      timeLimit: 5,
      points: 1,
      data: { targets: [{ shape: "circle", ...HOTSPOT }] },
    },
    {
      id: randomUUID(),
      type: "text",
      prompt: "Napíš hlavné mesto Slovenska",
      timeLimit: 20,
      points: 1,
      data: { fields: [{ key: "answer", weight: 1, accepted: ["Bratislava", "BA", "Pressburg"] }], tolerance: "normal" },
    },
    {
      id: randomUUID(),
      type: "music",
      prompt: "Čo hrá?",
      media: { audioId },
      timeLimit: 20,
      points: 1,
      data: {
        clip: { start: 0, duration: 1 },
        fields: [
          { key: "artist", label: "Interpret", weight: 0.5, accepted: ["Metallica"] },
          { key: "title", label: "Názov skladby", weight: 0.5, accepted: ["Nothing Else Matters"] },
        ],
        tolerance: "normal",
      },
    },
  ];
}

/** Correct answer payload (Alica) and a wrong one (Boris) for every question. */
function answersFor(q: Question, start: QuestionStartEvent): { right: unknown; wrong: unknown } {
  switch (q.type) {
    case "single":
      return { right: { optionId: q.data.correctId }, wrong: { optionId: "ke" } };
    case "multi":
      return { right: { optionIds: [...q.data.correctIds] }, wrong: { optionIds: ["green"] } };
    case "order": {
      assert(start.type === "order", "order question:start has no items");
      const presented = start.items.map((i) => i.id);
      equal(new Set(presented).size, ORDER_IDS.length, "order items");
      assert(JSON.stringify(presented) !== JSON.stringify(ORDER_IDS), "order items are sent in the correct order");
      return { right: { order: [...ORDER_IDS] }, wrong: { order: [...ORDER_IDS].reverse() } };
    }
    case "hotspot":
      return { right: { x: HOTSPOT.x, y: HOTSPOT.y }, wrong: { x: 0.05, y: 0.95 } };
    case "text":
      return { right: { answers: { answer: "bratislava" } }, wrong: { answers: { answer: "Kosice" } } };
    case "music":
      return {
        right: { answers: { artist: "Metalica", title: "nothing else matters" } },
        wrong: { answers: { artist: "Megadeth", title: "Symphony of Destruction" } },
      };
    case "number":
      return { right: { value: q.data.answer }, wrong: { value: q.data.answer + 1000 } };
  }
}

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

async function checkHttpBasics(): Promise<void> {
  section("HTTP basics");
  const health = parse(healthResponseSchema, await json(await http("/api/health"), 200, "health"), "health");
  equal(health, { status: "ok", db: true, redis: true }, "GET /api/health");
  ok("GET /api/health → ok, db + redis up");

  for (const path of ["/", "/host", "/play?pin=123456", "/host/quizzes/x"]) {
    const res = await http(path, { auth: false });
    const type = res.headers.get("content-type") ?? "";
    const html = await res.text();
    assert(res.status === 200 && type.startsWith("text/html") && html.includes('id="app"'), `SPA route ${path}`);
  }
  ok("SPA routes /, /host, /play?pin=… return index.html");

  equal(await json(await http("/api/nope", { auth: false }), 404, "unknown api"), { error: "NOT_FOUND" }, "unknown API");
  ok("unknown /api route → 404 NOT_FOUND");

  equal(await json(await http("/api/quizzes", { auth: false }), 401, "no session"), { error: "UNAUTHORIZED" }, "no session");
  ok("host route without session → 401 UNAUTHORIZED");

  const wrong = await http("/api/auth/login", { method: "POST", json: { password: `wrong-${randomUUID()}` } });
  equal(await json(wrong, 401, "wrong password"), { error: "WRONG_PASSWORD" }, "wrong password");
  ok("wrong password → 401 WRONG_PASSWORD");

  const login = await http("/api/auth/login", { method: "POST", json: { password: ADMIN_PASSWORD } });
  await json(login, 200, "login (is ADMIN_PASSWORD / SMOKE_ADMIN_PASSWORD right?)");
  const session = login.headers.getSetCookie().find((c) => c.startsWith("nexquiz_session="));
  assert(session, "login sets the session cookie");
  assert(/httponly/i.test(session) && /samesite=lax/i.test(session), "session cookie is httpOnly + sameSite=lax");
  cookie = session.split(";")[0] ?? "";
  equal(await json(await http("/api/auth/me"), 200, "me"), { authenticated: true }, "GET /api/auth/me");
  ok("login → session cookie, /api/auth/me authenticated");
}

async function uploadMedia(): Promise<{ imageId: string; audioId: string }> {
  section("Media");
  const png = generatePng(320, 240, HOTSPOT);
  const image = parse(
    mediaUploadResponseSchema,
    await json(await upload("spot.png", "image/png", png), 201, "image upload"),
    "image upload",
  );
  equal([image.kind, image.mime, image.width, image.height], ["image", "image/png", 320, 240], "image upload");
  ok(`PNG uploaded (${png.length} B, 320×240)`);

  const mp3 = generateMp3(1);
  const audio = parse(
    mediaUploadResponseSchema,
    await json(await upload("clip.mp3", "audio/mpeg", mp3), 201, "audio upload"),
    "audio upload",
  );
  equal([audio.kind, audio.mime], ["audio", "audio/mpeg"], "audio upload");
  assert(audio.duration !== undefined && audio.duration > 0.5 && audio.duration < 2, `audio duration ${audio.duration}`);
  ok(`MP3 uploaded (${mp3.length} B, ${audio.duration} s)`);

  const bad = await upload("note.txt", "text/plain", Buffer.from("hello"));
  equal(await json(bad, 415, "text upload"), { error: "UNSUPPORTED_MEDIA_TYPE" }, "text upload");
  const fake = await upload("fake.png", "image/png", Buffer.from("definitely not a png"));
  equal(await json(fake, 415, "fake png"), { error: "UNSUPPORTED_MEDIA_TYPE" }, "fake png");
  ok("unsupported / corrupt upload → 415 UNSUPPORTED_MEDIA_TYPE");

  const full = await http(image.url, { auth: false });
  assert(full.status === 200 && full.headers.get("content-type") === "image/png", "GET /media/:id");
  assert((full.headers.get("cache-control") ?? "").includes("immutable"), "media is cached immutable");
  await full.arrayBuffer();
  const range = await http(audio.url, { auth: false, headers: { range: "bytes=0-9" } });
  assert(range.status === 206 && (await range.arrayBuffer()).byteLength === 10, "Range request → 206");
  ok("GET /media/:id (immutable cache, Range → 206)");
  return { imageId: image.id, audioId: audio.id };
}

async function createQuiz(media: { imageId: string; audioId: string }): Promise<{ quizId: string; questions: Question[] }> {
  section("Quiz");
  const title = `Smoke test ${new Date().toISOString()}`;
  const created = parse(
    quizDtoSchema,
    await json(await http("/api/quizzes", { method: "POST", json: { title } }), 201, "create quiz"),
    "create quiz",
  );
  const questions = buildQuestions(media.imageId, media.audioId);
  const body: QuizUpdateRequest = {
    title,
    description: "Automatický smoke test",
    settings: { speedBonus: true, showLeaderboardAfterEach: true, shuffleOptions: true },
    questions,
  };
  const saved = parse(
    quizDtoSchema,
    await json(await http(`/api/quizzes/${created.id}`, { method: "PUT", json: body }), 200, "save quiz"),
    "save quiz",
  );
  equal(
    saved.questions.map((q) => q.type),
    ["single", "multi", "order", "hotspot", "text", "music"],
    "saved question types",
  );
  ok("quiz with all 6 question types saved");

  const missingImage = {
    ...body,
    questions: [{ ...questions[3], id: randomUUID(), media: { imageId: randomUUID() } }],
  };
  const invalid = await http(`/api/quizzes/${created.id}`, { method: "PUT", json: missingImage });
  equal(await json(invalid, 400, "unknown image"), { error: "INVALID" }, "unknown imageId");
  ok("PUT with an unknown imageId → 400 INVALID");
  return { quizId: created.id, questions };
}

interface Player {
  name: string;
  client: Client;
  playerId: string;
  token: string;
}

async function joinPlayer(pin: string, nickname: string): Promise<Player> {
  const c = client(nickname, "/play", { auth: { pin } }, "player");
  await c.connected();
  const ack = parse(playerJoinAckSchema, await c.emit("player:join", { pin, nickname }), "player:join ack");
  assert("token" in ack, `player:join ${nickname} failed: ${JSON.stringify(ack)}`);
  const state = await c.next("game:state", playerGameStateSchema);
  equal([state.state, state.nickname, state.playerId], ["LOBBY", nickname, ack.playerId], `${nickname} game:state`);
  return { name: nickname, client: c, playerId: ack.playerId, token: ack.token };
}

async function answer(p: Player, index: number, payload: unknown): Promise<unknown> {
  return parse(playerAnswerAckSchema, await p.client.emit("player:answer", { questionIndex: index, payload }), "answer ack");
}

async function hostCommand(host: Client, event: string, payload?: unknown): Promise<unknown> {
  const ack = payload === undefined ? await host.emit(event) : await host.emit(event, payload);
  return parse(okOrErrorAckSchema, ack, `${event} ack`);
}

async function playGame(quizId: string, questions: Question[]): Promise<{ gameId: string; pin: string }> {
  section("Game: lobby");
  const created = parse(
    createGameResponseSchema,
    await json(await http("/api/games", { method: "POST", json: { quizId } }), 201, "create game"),
    "create game",
  );
  const { pin, gameId } = created;
  const exists = await http(`/api/games/${pin}/exists`, { auth: false });
  equal(parse(gameExistsResponseSchema, await json(exists, 200, "exists"), "exists"), { exists: true }, "exists");
  const qr = await http(`/api/games/${pin}/qr`);
  assert(qr.status === 200 && qr.headers.get("content-type") === "image/png", "QR code is a PNG");
  await qr.arrayBuffer();
  ok(`game ${pin} created, /exists true, QR PNG served`);

  const intruder = client("intruder", "/host", {}, "host");
  equal(await intruder.connectError(), "UNAUTHORIZED", "/host without session");
  ok("/host namespace without session → UNAUTHORIZED");

  const host = client("host", "/host", { cookie }, "host");
  await host.connected();
  const attached = parse(hostGameStateSchema, await host.emit("host:attach", { pin }), "host:attach ack");
  equal([attached.state, attached.currentIndex, attached.total], ["LOBBY", -1, 6], "host:attach state");
  ok("host attached (LOBBY, currentIndex -1)");

  const alica = await joinPlayer(pin, "Alica");
  const boris = await joinPlayer(pin, "Boris");
  ok("players Alica and Boris joined (game:state LOBBY after join)");

  const dupe = client("dupe", "/play", { auth: { pin } }, "player");
  await dupe.connected();
  equal(await dupe.emit("player:join", { pin, nickname: "  ALICA " }), { error: "NICK_TAKEN" }, "duplicate nickname");
  ok("nickname check ignores case → NICK_TAKEN");

  const kicked = await joinPlayer(pin, "Kicked");
  await host.next("lobby:players", lobbyPlayersEventSchema, (e) => e.players.length === 3);
  equal(await hostCommand(host, "host:kick", { playerId: kicked.playerId }), { ok: true }, "host:kick");
  await kicked.client.next("player:kicked", z.unknown());
  await host.next("lobby:players", lobbyPlayersEventSchema, (e) => e.players.length === 2);
  equal(await kicked.client.emit("player:rejoin", { pin, token: kicked.token }), { error: "INVALID_TOKEN" }, "kicked rejoin");
  ok("host:kick → player:kicked, lobby back to 2 players, kicked token invalid");

  equal(await hostCommand(host, "host:next"), { error: "INVALID_TRANSITION" }, "host:next in LOBBY");
  ok("host:next in LOBBY → INVALID_TRANSITION");

  equal(await hostCommand(host, "host:start"), { ok: true }, "host:start");
  let currentHost = host;
  let p1 = alica;
  const p2 = boris;

  for (const [index, question] of questions.entries()) {
    section(`Question ${index + 1}: ${question.type}`);
    const hostStart = await currentHost.next("question:start", questionStartEventSchema, (e) => e.index === index);
    const p1Start = await p1.client.next("question:start", questionStartEventSchema, (e) => e.index === index);
    await p2.client.next("question:start", questionStartEventSchema, (e) => e.index === index);
    equal([hostStart.type, hostStart.total], [question.type, 6], "question:start");
    if (question.type === "music") {
      assert(hostStart.media.audioId === question.media?.audioId, "host gets media.audioId");
      assert(p1Start.media.audioId === undefined, "player does not get media.audioId");
      assert(hostStart.type === "music" && hostStart.clip.duration === 1, "music question:start carries the clip");

      // Players with sound on their own device get only the cut clip (ffmpeg), never the tagged file.
      const clipPath = `/api/games/${pin}/questions/${index}/clip`;
      const clip = await http(clipPath, { auth: false, headers: { authorization: `Bearer ${p1.token}` } });
      assert(clip.status === 200, `player clip: expected HTTP 200, got ${clip.status} ${await clip.clone().text()}`);
      assert(clip.headers.get("content-type") === "audio/mpeg", "player clip is audio/mpeg");
      const clipData = Buffer.from(await clip.arrayBuffer());
      assert(clipData.length > 0 && clipData.toString("latin1", 0, 3) !== "ID3", "player clip without ID3 tags");
      equal(await json(await http(clipPath, { auth: false }), 401, "clip without token"), { error: "INVALID_TOKEN" }, "clip without token");
      ok("player audio clip: cut on the server, no tags, only with the player token");
    }
    if (question.type === "hotspot") assert(p1Start.media.imageId === question.media?.imageId, "player gets imageId");
    ok("question:start for host and players, no secrets in payloads");

    const { right, wrong } = answersFor(question, p1Start);

    if (question.type === "multi") {
      equal(await answer(p2, index, { optionIds: ["nope"] }), { error: "INVALID" }, "foreign option id");
      ok("option id not belonging to the question → INVALID");
    }
    if (question.type === "order") {
      equal(await answer(p2, index, { order: ["mon", "mon", "tue", "wed"] }), { error: "INVALID" }, "non permutation");
      ok("order that is not a permutation → INVALID");
    }

    equal(await answer(p1, index, right), { ok: true }, `${p1.name} answer`);
    equal(await answer(p1, index, right), { error: "ALREADY_ANSWERED" }, "second answer");
    ok("second answer → ALREADY_ANSWERED");
    await currentHost.next("question:progress", questionProgressEventSchema, (e) => e.answered === 1 && e.total === 2);
    ok("host question:progress 1 / 2");

    if (question.type === "hotspot") {
      // Rejoin with the stored token in the middle of a question.
      p1.client.close();
      await currentHost.next("lobby:players", lobbyPlayersEventSchema, (e) =>
        e.players.some((p) => p.id === p1.playerId && !p.connected),
      );
      const again = client("Alica (rejoined)", "/play", { auth: { pin, token: p1.token } }, "player");
      await again.connected();
      const raw = await again.emit("player:rejoin", { pin, token: p1.token });
      again.checkState(raw, "player:rejoin ack");
      const state = parse(playerGameStateSchema, raw, "player:rejoin ack");
      equal(
        [state.state, state.currentIndex, state.hasAnswered, state.playerId, state.question?.index],
        ["QUESTION", index, true, p1.playerId, index],
        "rejoin state",
      );
      p1 = { ...p1, client: again };
      await currentHost.next("lobby:players", lobbyPlayersEventSchema, (e) =>
        e.players.some((p) => p.id === p1.playerId && p.connected),
      );
      ok("disconnect + player:rejoin → full QUESTION state with hasAnswered, connected again");

      equal(await answer(p1, index - 1, right), { error: "LATE" }, "answer to previous question");
      equal(await answer(p1, index + 1, right), { error: "INVALID" }, "answer to future question");
      ok("answer for previous index → LATE, future index → INVALID");

      // Boris never answers: the server timer (5 s + grace) has to end the question.
      const started = Date.now();
      await currentHost.next("question:end", questionEndEventSchema, (e) => e.index === index);
      const waited = Date.now() - started;
      assert(waited > 3000, `question ended too early (${waited} ms) – expected the deadline timer`);
      equal(await answer(p2, index, wrong), { error: "LATE" }, "answer after the deadline");
      ok(`deadline timer ended the question (~${Math.round(waited / 100) / 10} s), late answer → LATE`);
    } else {
      equal(await answer(p2, index, wrong), { ok: true }, `${p2.name} answer`);
      await currentHost.next("question:end", questionEndEventSchema, (e) => e.index === index);
      ok("all connected players answered → question ended automatically");
      if (index === 0) {
        equal(await answer(p2, index, right), { error: "LATE" }, "answer in REVEAL");
        ok("answer after the question ended → LATE");
      }
    }

    const reveal = await currentHost.next("question:reveal", questionRevealEventSchema, (e) => e.index === index);
    equal(reveal.correct.type, question.type, "reveal type");
    const r1 = await p1.client.next("player:result", playerResultEventSchema, (e) => e.index === index);
    const r2 = await p2.client.next("player:result", playerResultEventSchema, (e) => e.index === index);
    equal(r1.correctness, 1, `${p1.name} correctness`);
    assert(r1.points > 0 && r1.points <= question.points, `${p1.name} points ${r1.points}`);
    equal(r2.correctness, 0, `${p2.name} correctness`);
    equal(r2.points, 0, `${p2.name} points`);
    if (question.type === "hotspot") {
      equal(r2.yourAnswer, null, "missing answer");
      assert(reveal.stats.type === "hotspot" && reveal.stats.taps.length === 1 && reveal.stats.taps[0]?.hit, "taps");
    }
    if (question.type === "music") equal(r1.perField, { artist: true, title: true }, "music perField (fuzzy artist)");
    ok(`reveal: ${p1.name} correct (${r1.points} b), ${p2.name} wrong (0 b)`);

    if (question.type === "text") await checkOverride(currentHost, p2, index, reveal);

    if (question.type === "music") {
      // Host reconnect: a fresh socket gets the full snapshot with host:attach.
      currentHost.close();
      const reattached = client("host (reattached)", "/host", { cookie }, "host");
      await reattached.connected();
      const raw = await reattached.emit("host:attach", { pin });
      reattached.checkState(raw, "host:attach ack");
      const state = parse(hostGameStateSchema, raw, "host:attach ack");
      equal([state.state, state.currentIndex, state.reveal?.index], ["REVEAL", index, index], "host reattach state");
      currentHost = reattached;
      ok("host reconnect + host:attach → full REVEAL state");
    }

    equal(await hostCommand(currentHost, "host:next"), { ok: true }, "host:next → leaderboard");
    const board = await currentHost.next("leaderboard", leaderboardEventSchema, (e) => e.index === index);
    await p2.client.next("leaderboard", leaderboardEventSchema, (e) => e.index === index);
    equal(board.top[0]?.nickname, "Alica", "leaderboard leader");
    ok(`leaderboard after question ${index + 1} (leader ${board.top[0]?.nickname} ${board.top[0]?.score})`);
    equal(await hostCommand(currentHost, "host:next"), { ok: true }, "host:next");
  }

  section("Game: finished");
  const finished = await currentHost.next("game:finished", gameFinishedEventSchema);
  const finishedP1 = await p1.client.next("game:finished", gameFinishedEventSchema);
  await p2.client.next("game:finished", gameFinishedEventSchema);
  equal(finished.ranking.map((r) => [r.nickname, r.rank]), [["Alica", 1], ["Boris", 2]], "final ranking");
  equal(finishedP1.podium.length, 2, "podium size");
  ok(`game:finished → Alica ${finished.ranking[0]?.score}, Boris ${finished.ranking[1]?.score}`);

  const rejoin = client("Boris (after end)", "/play", { auth: { pin, token: p2.token } }, "player");
  await rejoin.connected();
  const state = parse(playerGameStateSchema, await rejoin.emit("player:rejoin", { pin, token: p2.token }), "rejoin");
  equal([state.state, state.finished?.ranking.length], ["FINISHED", 2], "rejoin after FINISHED");
  ok("rejoin after the end → FINISHED state with the ranking");

  const late = client("late", "/play", { auth: { pin } }, "player");
  await late.connected();
  equal(await late.emit("player:join", { pin, nickname: "Late" }), { error: "GAME_FINISHED" }, "join after end");
  const existsAfter = await http(`/api/games/${pin}/exists`, { auth: false });
  equal(parse(gameExistsResponseSchema, await json(existsAfter, 200, "exists"), "exists"), { exists: false }, "exists");
  ok("join after the end → GAME_FINISHED, /exists false (PIN released)");
  return { gameId, pin };
}

async function checkOverride(
  host: Client,
  p2: Player,
  index: number,
  reveal: z.infer<typeof questionRevealEventSchema>,
): Promise<void> {
  assert(reveal.stats.type === "text", "text reveal stats");
  const groups = reveal.stats.fields[0]?.groups ?? [];
  const kosice = groups.find((g) => g.normalized === "kosice");
  assert(kosice && !kosice.accepted && !kosice.overridden && kosice.count === 1, "group 'kosice' not accepted");
  assert(groups.some((g) => g.normalized === "bratislava" && g.accepted), "group 'bratislava' accepted");

  const unknown = await hostCommand(host, "host:override", {
    questionIndex: index,
    fieldKey: "answer",
    normalized: "presov",
    accept: true,
  });
  equal(unknown, { error: "INVALID" }, "override of an unknown group");
  const ack = await hostCommand(host, "host:override", {
    questionIndex: index,
    fieldKey: "answer",
    normalized: "kosice",
    accept: true,
  });
  equal(ack, { ok: true }, "host:override");
  const updated = await host.next("question:reveal", questionRevealEventSchema, (e) => e.index === index);
  assert(updated.stats.type === "text", "updated reveal stats");
  const group = updated.stats.fields[0]?.groups.find((g) => g.normalized === "kosice");
  assert(group?.accepted && group.overridden, "overridden group is accepted + overridden");
  const result = await p2.client.next("player:result", playerResultEventSchema, (e) => e.index === index);
  equal(result.correctness, 1, "overridden correctness");
  assert(result.points > 0 && result.totalScore === result.points, `overridden points ${result.points}`);
  ok(`host:override 'kosice' → reveal updated (✋), Boris recalculated to ${result.points} b`);
}

async function checkHistory(gameId: string, pin: string): Promise<void> {
  section("History and CSV");
  const history = parse(gameHistoryResponseSchema, await json(await http("/api/games"), 200, "history"), "history");
  const row = history.find((g) => g.id === gameId);
  assert(row, "finished game is in the history");
  equal([row.pin, row.status, row.playerCount, row.winner], [pin, "finished", 2, "Alica"], "history row");
  assert(row.startedAt !== null && row.finishedAt !== null, "startedAt / finishedAt set");
  ok("GET /api/games: finished, 2 players, winner Alica");

  const results = parse(
    gameResultsResponseSchema,
    await json(await http(`/api/games/${gameId}/results`), 200, "results"),
    "results",
  );
  equal(results.questions.length, 6, "results questions");
  equal(
    results.players.map((p) => [p.nickname, p.finalRank]),
    [["Alica", 1], ["Boris", 2]],
    "results players",
  );
  const boris = results.players.find((p) => p.nickname === "Boris");
  assert(boris, "Boris in results");
  const borisAnswers = results.answers.filter((a) => a.playerId === boris.id);
  equal(borisAnswers.length, 5, "Boris answers persisted (hotspot unanswered)");
  const text = borisAnswers.find((a) => a.questionIndex === 4);
  assert(text && text.correctness === 1 && text.points > 0 && text.points === boris.score, "override persisted");
  equal(results.answers.filter((a) => a.playerId !== boris.id).length, 6, "Alica answers persisted");
  ok("GET /api/games/:id/results: ranks, 11 answers, override persisted");

  const csvRes = await http(`/api/games/${gameId}/results?format=csv`);
  assert(csvRes.status === 200 && (csvRes.headers.get("content-type") ?? "").startsWith("text/csv"), "CSV response");
  assert((csvRes.headers.get("content-disposition") ?? "").includes(`nexquiz-${pin}-`), "CSV filename");
  const bytes = new Uint8Array(await csvRes.arrayBuffer());
  equal([...bytes.slice(0, 3)], [0xef, 0xbb, 0xbf], "CSV UTF-8 BOM");
  const lines = new TextDecoder().decode(bytes.slice(3)).trimEnd().split("\r\n");
  equal(lines[0], "rank,nickname,score,Q1,Q2,Q3,Q4,Q5,Q6", "CSV header");
  equal(lines.length, 3, "CSV rows");
  assert(lines[1]?.startsWith("1,Alica,") && lines[2]?.startsWith("2,Boris,"), "CSV ranking");
  equal(lines[2]?.split(",").slice(3), ["0.00", "0.00", "0.00", "0.00", text.points.toFixed(2), "0.00"], "CSV Boris");
  ok("CSV export: BOM, header rank,nickname,score,Q1…Q6, 2 players");
}

async function main(): Promise<void> {
  console.log(`NexQuiz smoke test against ${BASE_URL}`);
  assert(ADMIN_PASSWORD !== "", "set ADMIN_PASSWORD (or SMOKE_ADMIN_PASSWORD)");
  await checkHttpBasics();
  const media = await uploadMedia();
  const { quizId, questions } = await createQuiz(media);
  const { gameId, pin } = await playGame(quizId, questions);
  await checkHistory(gameId, pin);
  assert(checkedQuestionPayloads.count >= 6 * 3, "question payloads were checked for secrets");
  ok(`${checkedQuestionPayloads.count} question payloads checked for secrets`);

  if (!KEEP_QUIZ) {
    await json(await http(`/api/quizzes/${quizId}`, { method: "DELETE" }), 204, "delete quiz");
    const history = parse(gameHistoryResponseSchema, await json(await http("/api/games"), 200, "history"), "history");
    assert(history.some((g) => g.id === gameId && g.quizId === null), "history survives quiz deletion");
    ok("smoke quiz deleted, game stays in the history");
  }
  await json(await http("/api/auth/logout", { method: "POST" }), 200, "logout");
}

main()
  .then(() => {
    console.log(`\nPASS – ${passed} checks`);
    process.exitCode = 0;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFAIL – ${message}`);
    if (!(err instanceof SmokeFailure) && err instanceof Error && err.stack) console.error(err.stack);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const c of clients) c.close();
  });
