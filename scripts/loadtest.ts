/**
 * Load test against a running NexQuiz stack: one host and 25 players play a
 * 30-question quiz (every question type, two pages, long prompts / options)
 * over REST + Socket.IO and the script measures how responsive the server is.
 *
 *   docker compose --profile smoke run --rm smoke sh -c \
 *     "npm install --no-audit --no-fund --loglevel=error && npm run loadtest"
 *   ADMIN_PASSWORD=… LOADTEST_BASE_URL=http://localhost:3000 npm run loadtest
 *
 * The players behave like a classroom behind one NAT (one IP): they call
 * `/exists` like the web client, join with retries when rate limited, answer
 * with a mix of correct / partial / wrong / no answer at randomized delays,
 * and the host advances question → reveal → leaderboard → next like the host
 * UI (with one `host:override` on a text question).
 *
 * The quiz and the finished game are KEPT so they can be opened in the editor
 * and in the results page afterwards. Exits with code 1 when the game cannot
 * be completed (timeouts, unexpected payloads).
 */
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import {
  ANSWER_GRACE_MS,
  createGameResponseSchema,
  gameExistsResponseSchema,
  gameFinishedEventSchema,
  gameResultsResponseSchema,
  hostGameStateSchema,
  isPage,
  leaderboardEventSchema,
  LIMITS,
  lobbyPlayersEventSchema,
  mediaUploadResponseSchema,
  okOrErrorAckSchema,
  pageShowEventSchema,
  playerJoinAckSchema,
  playerResultEventSchema,
  questionEndEventSchema,
  questionRevealEventSchema,
  questionStartEventSchema,
  quizDtoSchema,
  quizUpdateRequestSchema,
  type Avatar,
  type GameFinishedEvent,
  type Question,
  type QuizItem,
  type QuizUpdateRequest,
} from "@nexquiz/shared";
import { io, type Socket } from "socket.io-client";
import type { z } from "zod";
import { generateMp3, generatePng } from "./media.js";

const BASE_URL = (process.env.LOADTEST_BASE_URL ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);
/** Base URL for the printed links (inside compose the api is `http://api:3000`, the browser uses localhost). */
const PUBLIC_URL = (process.env.LOADTEST_PUBLIC_URL ?? BASE_URL.replace("//api:", "//localhost:")).replace(/\/+$/, "");
const ADMIN_PASSWORD =
  process.env.LOADTEST_ADMIN_PASSWORD ?? process.env.SMOKE_ADMIN_PASSWORD ?? process.env.ADMIN_PASSWORD ?? "";
const PLAYER_COUNT = intEnv("LOADTEST_PLAYERS", 25);
const SEED = intEnv("LOADTEST_SEED", Math.floor(Math.random() * 2 ** 31));
/** Host "reading time" on the reveal and leaderboard screens before pressing next. */
const HOST_PAUSE_MS = intEnv("LOADTEST_HOST_PAUSE_MS", 400);
/** Retry interval of `player:join` after `RATE_LIMITED`, and how long a player keeps trying. */
const JOIN_RETRY_MS = intEnv("LOADTEST_JOIN_RETRY_MS", 5_000);
const JOIN_GIVE_UP_MS = intEnv("LOADTEST_JOIN_GIVE_UP_MS", 180_000);
/**
 * `GET /exists` calls per player before joining. The web client checks once
 * (landing page, or /play after a QR code); 2 = e.g. a reload of /play.
 */
const EXISTS_CALLS = intEnv("LOADTEST_EXISTS_CALLS", 1);
/** Delay between two players' arrivals (default 100 ms ≈ a class scanning the QR code). */
const ARRIVAL_MS = intEnv("LOADTEST_ARRIVAL_MS", 100);
/** `1` = stop after the last question's leaderboard (game left open for the host UI, no `game:finished`). */
const KEEP_OPEN = process.env.LOADTEST_KEEP_OPEN === "1";
/**
 * `1` = every player sends its own `CF-Connecting-IP`, i.e. simulates players
 * on different networks (works only on direct access to the api, never through
 * Cloudflare). Default: all players share one IP like a classroom behind NAT.
 */
const DISTINCT_IPS = process.env.LOADTEST_DISTINCT_IPS === "1";
const WAIT_MS = 20_000;
const ACK_TIMEOUT_MS = 10_000;

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  return value;
}

class LoadTestFailure extends Error {}

function fail(message: string): never {
  throw new LoadTestFailure(message);
}

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) fail(`${what} has an unexpected shape: ${result.error.message} – ${JSON.stringify(value)}`);
  return result.data;
}

// ---------------------------------------------------------------------------
// Seeded randomness (LOADTEST_SEED reproduces a run's answers and delays)
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(SEED);

function between(min: number, max: number): number {
  return min + rand() * (max - min);
}

function pick<T>(items: readonly T[]): T {
  const item = items[Math.floor(rand() * items.length)];
  if (item === undefined) fail("pick from an empty list");
  return item;
}

function shuffled<T>(items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const a = out[i] as T;
    out[i] = out[j] as T;
    out[j] = a;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

class Samples {
  readonly values: number[] = [];

  add(value: number): void {
    this.values.push(value);
  }

  stats(): { count: number; min: number; median: number; p95: number; max: number } | null {
    if (this.values.length === 0) return null;
    const sorted = [...this.values].sort((a, b) => a - b);
    const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)] ?? 0;
    return { count: sorted.length, min: sorted[0] ?? 0, median: at(0.5), p95: at(0.95), max: sorted.at(-1) ?? 0 };
  }
}

const metrics = {
  restLogin: new Samples(),
  restUpload: new Samples(),
  restSaveQuiz: new Samples(),
  restCreateGame: new Samples(),
  restExists: new Samples(),
  connect: new Samples(),
  join: new Samples(),
  joinWait: new Samples(),
  hostAck: new Samples(),
  questionStart: new Samples(),
  questionStartSpread: new Samples(),
  pageShow: new Samples(),
  answer: new Samples(),
  revealAfterEnd: new Samples(),
  resultAfterEnd: new Samples(),
  timerLag: new Samples(),
  leaderboard: new Samples(),
  overrideAck: new Samples(),
  overrideResult: new Samples(),
  finished: new Samples(),
  restResults: new Samples(),
};

const METRIC_LABELS: Record<keyof typeof metrics, string> = {
  restLogin: "REST POST /api/auth/login",
  restUpload: "REST POST /api/media (PNG/MP3)",
  restSaveQuiz: "REST PUT /api/quizzes/:id (31 items)",
  restCreateGame: "REST POST /api/games",
  restExists: "REST GET /api/games/:pin/exists",
  connect: "socket connect /play",
  join: "player:join ack (successful)",
  joinWait: "join: first try → joined (incl. retries)",
  hostAck: "host:start / host:next ack",
  questionStart: "host:next → player question:start",
  questionStartSpread: "question:start first → last player",
  pageShow: "host:next → player page:show",
  answer: "player:answer ack",
  revealAfterEnd: "question:end → host question:reveal",
  resultAfterEnd: "question:end → player:result",
  timerLag: "deadline+grace → question:end (timer)",
  leaderboard: "host:next → player leaderboard",
  overrideAck: "host:override ack",
  overrideResult: "host:override → re-sent player:result",
  finished: "host:next → player game:finished",
  restResults: "REST GET /api/games/:id/results",
};

/** Error acks / failures by `event:code`. */
const errors = new Map<string, number>();

function countError(key: string): void {
  errors.set(key, (errors.get(key) ?? 0) + 1);
}

const findings: string[] = [];

/** Wakes every pending `waitUntil` whenever any socket receives something. */
const bus = new EventEmitter();
bus.setMaxListeners(200);

function waitUntil(predicate: () => boolean, what: string, timeoutMs = WAIT_MS): Promise<void> {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      bus.off("tick", onTick);
    };
    const onTick = () => {
      if (!predicate()) return;
      cleanup();
      resolve();
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new LoadTestFailure(`timed out after ${timeoutMs} ms waiting for ${what}`));
    }, timeoutMs);
    bus.on("tick", onTick);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  if (res.status !== expectedStatus) fail(`${what}: expected HTTP ${expectedStatus}, got ${res.status} ${text}`);
  return text === "" ? null : (JSON.parse(text) as unknown);
}

async function timed<T>(samples: Samples, run: () => Promise<T>): Promise<T> {
  const started = performance.now();
  try {
    return await run();
  } finally {
    samples.add(performance.now() - started);
  }
}

async function upload(name: string, mime: string, data: Buffer): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mime }), name);
  const res = await timed(metrics.restUpload, () => http("/api/media", { method: "POST", body: form }));
  return parse(mediaUploadResponseSchema, await json(res, 201, `upload ${name}`), `upload ${name}`).id;
}

// ---------------------------------------------------------------------------
// Quiz: 30 questions of all 7 types + 2 pages
// ---------------------------------------------------------------------------

const TIME_LIMIT = LIMITS.timeLimit.min;

/** Answer material the bots need besides the question itself (wrong / near-miss variants). */
interface Extra {
  /** `text`: wrong answers; `music`: wrong artists. */
  wrong?: string[];
  /** `text`: misspelled variants of a correct answer (fuzzy matching decides). */
  typos?: string[];
  /** `music`: wrong titles. */
  wrongTitles?: string[];
  /** `text`: an unaccepted answer a few players give and the host then accepts. */
  override?: string;
  /** `hotspot`: image size for the hit test. */
  image?: { width: number; height: number };
}

interface ImageSpec {
  width: number;
  height: number;
  spot: { x: number; y: number };
}

const IMAGES = {
  wide: { width: 640, height: 360, spot: { x: 0.7, y: 0.3 } },
  portrait: { width: 360, height: 640, spot: { x: 0.3, y: 0.8 } },
  square: { width: 400, height: 400, spot: { x: 0.5, y: 0.5 } },
  banner: { width: 800, height: 200, spot: { x: 0.9, y: 0.5 } },
  photo: { width: 480, height: 320, spot: { x: 0.25, y: 0.6 } },
  cover: { width: 960, height: 540, spot: { x: 0.5, y: 0.5 } },
} as const satisfies Record<string, ImageSpec>;

type ImageKey = keyof typeof IMAGES;
type MediaIds = Record<ImageKey, string> & { song: string; folk: string };

function opts(...texts: string[]): { id: string; text: string }[] {
  return texts.map((text, i) => ({ id: `o${i + 1}`, text }));
}

function hotspot(prompt: string, imageId: string, image: ImageSpec, points = 1000): Question {
  // The red square of the generated PNG has a half-size of 16 px; the target is a bit larger.
  const r = Math.round((24 / image.width) * 1000) / 1000;
  return {
    id: randomUUID(),
    type: "hotspot",
    prompt,
    media: { imageId },
    timeLimit: TIME_LIMIT,
    points,
    data: { targets: [{ shape: "circle", x: image.spot.x, y: image.spot.y, r }] },
  };
}

function buildQuiz(media: MediaIds): { items: QuizItem[]; extras: Map<string, Extra> } {
  const extras = new Map<string, Extra>();
  const q = (question: Question, extra: Extra = {}): Question => {
    extras.set(question.id, extra);
    return question;
  };
  const base = { timeLimit: TIME_LIMIT, points: 1000 };

  const items: QuizItem[] = [
    {
      id: randomUUID(),
      type: "page",
      title: "1. kolo: Slovensko, svet a trochu histórie",
      description:
        "Vitajte pri záťažovom teste NexQuizu! Čaká vás 30 otázok všetkých typov: jedna a viac správnych odpovedí, " +
        "zoraďovanie, ťukanie do obrázka, písaná odpoveď, hádanie pesničky aj odhad čísla. Na každú otázku máte iba " +
        "päť sekúnd, takže nečítajte príliš dlho a radšej ťukajte rýchlo. Za rýchlu odpoveď dostanete viac bodov, " +
        "za pomalú o niečo menej, za nesprávnu žiadne. Pri otázkach s viacerými správnymi odpoveďami a pri " +
        "zoraďovaní sa počítajú aj čiastočne správne odpovede. Tento dlhý popis slúži aj na kontrolu, či sa stránka " +
        "medzi otázkami zmestí na obrazovku projektora aj mobilu bez posúvania a či je text stále dobre čitateľný.",
      media: { imageId: media.cover },
    },
    // --- single -------------------------------------------------------------
    q({
      id: randomUUID(),
      type: "single",
      prompt: "Ktoré mesto je hlavným mestom Slovenska?",
      ...base,
      data: { options: opts("Bratislava", "Košice", "Žilina", "Nitra"), correctId: "o1" },
    }),
    q({
      id: randomUUID(),
      type: "single",
      prompt:
        "V júli 1843 sa Ľudovít Štúr, Jozef Miloslav Hurban a Michal Miloslav Hodža stretli na fare v Hlbokom a " +
        "dohodli sa na spoločnej spisovnej slovenčine, ktorú potom Štúr opísal vo svojich jazykovedných dielach. " +
        "Na základe ktorého nárečia bola táto spisovná slovenčina kodifikovaná?",
      ...base,
      points: 2000,
      data: {
        options: opts(
          "Na základe stredoslovenského nárečia, ktoré bolo zrozumiteľné vo väčšine regiónov Slovenska",
          "Na základe západoslovenského nárečia, ktoré už predtým použil Anton Bernolák vo svojej gramatike",
          "Na základe východoslovenského nárečia, ktorým hovorila veľká časť obyvateľov Horného Uhorska",
          "Na základe bibličtiny, ktorá sa dovtedy používala v evanjelickej cirkvi na celom území Slovenska",
        ),
        correctId: "o1",
      },
    }),
    q({
      id: randomUUID(),
      type: "single",
      prompt: "Koľko červených štvorcov je na obrázku?",
      media: { imageId: media.photo },
      ...base,
      data: { options: opts("Žiadny", "Jeden", "Dva", "Tri"), correctId: "o2" },
    }),
    q({
      id: randomUUID(),
      type: "single",
      prompt: "Ktorá z týchto riek NEpreteká územím Slovenska?",
      ...base,
      data: { options: opts("Dunaj", "Váh", "Hron", "Morava", "Vltava", "Ipeľ"), correctId: "o5" },
    }),
    q({
      id: randomUUID(),
      type: "single",
      prompt: "Koľko samosprávnych krajov má Slovensko?",
      ...base,
      points: 500,
      data: { options: opts("6", "8", "10", "79"), correctId: "o2" },
    }),
    q({
      id: randomUUID(),
      type: "single",
      prompt: "Pravda alebo nepravda: Gerlachovský štít je najvyšší vrch celých Karpát.",
      ...base,
      data: { options: opts("Pravda", "Nepravda"), correctId: "o1" },
    }),
    // --- multi --------------------------------------------------------------
    q({
      id: randomUUID(),
      type: "multi",
      prompt: "Ktoré farby sú na slovenskej vlajke?",
      ...base,
      data: {
        options: opts("Biela", "Modrá", "Červená", "Zelená", "Žltá"),
        correctIds: ["o1", "o2", "o3"],
        scoring: "partial",
      },
    }),
    q({
      id: randomUUID(),
      type: "multi",
      prompt:
        "Slovensko má na Zozname svetového kultúrneho a prírodného dedičstva UNESCO niekoľko lokalít. Ktoré z " +
        "nasledujúcich miest alebo pamiatok sú na tomto zozname zapísané? Označ všetky správne možnosti, za " +
        "čiastočne správnu odpoveď dostaneš časť bodov.",
      ...base,
      points: 2000,
      data: {
        options: opts(
          "Banská Štiavnica a technické pamiatky jej okolia vrátane historických vodných nádrží – tajchov",
          "Spišský hrad a jeho okolie spolu so Spišskou Kapitulou, Spišským Podhradím a kostolom v Žehre",
          "Vlkolínec – rázovitá horská dedinka s typickou ľudovou zrubovou architektúrou pod Sidorovom",
          "Bojnický zámok s rozsiahlym anglickým parkom a najstaršou zoologickou záhradou na Slovensku",
          "Oravský hrad týčiaci sa na vysokom vápencovom brale nad riekou Orava v Oravskom Podzámku",
          "Bardejov – zachovalé stredoveké historické jadro mesta spolu so židovským suburbiom",
        ),
        correctIds: ["o1", "o2", "o3", "o6"],
        scoring: "partial",
      },
    }),
    q({
      id: randomUUID(),
      type: "multi",
      prompt: "Ktoré z týchto čísel sú prvočísla? (body iba za úplne správnu odpoveď)",
      ...base,
      data: { options: opts("2", "9", "11", "15", "17", "21"), correctIds: ["o1", "o3", "o5"], scoring: "all" },
    }),
    q({
      id: randomUUID(),
      type: "multi",
      prompt: "Ktoré z týchto planét majú prstence?",
      ...base,
      data: {
        options: opts("Merkúr", "Venuša", "Mars", "Jupiter", "Saturn", "Urán"),
        correctIds: ["o4", "o5", "o6"],
        scoring: "partial",
      },
    }),
    q({
      id: randomUUID(),
      type: "multi",
      prompt: "Ktoré z týchto zvierat sú cicavce?",
      ...base,
      data: {
        options: opts("Delfín", "Netopier", "Tučniak", "Ježko", "Pštros", "Krokodíl"),
        correctIds: ["o1", "o2", "o4"],
        scoring: "partial",
      },
    }),
    // --- order --------------------------------------------------------------
    q({
      id: randomUUID(),
      type: "order",
      prompt: "Zoraď planéty podľa vzdialenosti od Slnka, od najbližšej.",
      ...base,
      data: { items: opts("Merkúr", "Venuša", "Zem", "Mars", "Jupiter"), scoring: "partial" },
    }),
    q({
      id: randomUUID(),
      type: "order",
      prompt:
        "Zoraď nasledujúce udalosti slovenských dejín chronologicky od najstaršej po najnovšiu. Pozor, niektoré " +
        "z nich sú od seba vzdialené niekoľko storočí, iné iba niekoľko desaťročí. Body dostaneš za každú dvojicu " +
        "udalostí, ktorú máš v správnom poradí.",
      ...base,
      points: 2000,
      data: {
        items: opts(
          "Príchod Konštantína a Metoda na Veľkú Moravu a zavedenie staroslovienčiny do bohoslužieb",
          "Bernolákova kodifikácia spisovnej slovenčiny v diele Dissertatio philologico-critica",
          "Memorandum národa slovenského prijaté na zhromaždení v Turčianskom Svätom Martine",
          "Vznik Československej republiky a podpísanie Martinskej deklarácie slovenským národom",
          "Vznik samostatnej Slovenskej republiky po pokojnom rozdelení Česko-Slovenska",
          "Vstup Slovenska do Európskej únie a do Severoatlantickej aliancie (NATO)",
        ),
        scoring: "partial",
      },
    }),
    q({
      id: randomUUID(),
      type: "order",
      prompt: "Zoraď čísla od najmenšieho po najväčšie (body iba za úplne správne poradie).",
      ...base,
      data: { items: opts("½", "0,6", "⅔", "¾"), scoring: "all" },
    }),
    q({
      id: randomUUID(),
      type: "order",
      prompt: "Zoraď mestá od západu na východ.",
      ...base,
      data: { items: opts("Bratislava", "Trnava", "Žilina", "Poprad", "Košice"), scoring: "partial" },
    }),
    {
      id: randomUUID(),
      type: "page",
      title: "2. kolo: obrázky, hudba a čísla",
      description: "Teraz budeš ťukať do obrázkov, písať odpovede, hádať pesničky a odhadovať čísla.",
      media: { imageId: media.wide },
    },
    // --- hotspot ------------------------------------------------------------
    q(hotspot("Ťukni na červený štvorec.", media.wide, IMAGES.wide), { image: IMAGES.wide }),
    q(
      hotspot(
        "Na tomto vysokom obrázku na výšku je niekde ukrytý malý červený štvorec. Nájdi ho čo najrýchlejšie a ťukni " +
          "presne naň. Obrázok je zámerne úzky a vysoký, aby sa dalo skontrolovať, či sa celý zmestí na obrazovku " +
          "mobilu aj projektora bez posúvania a či ťuknutie trafí správne miesto.",
        media.portrait,
        IMAGES.portrait,
        2000,
      ),
      { image: IMAGES.portrait },
    ),
    q(hotspot("Ťukni do stredu červeného štvorca.", media.square, IMAGES.square), { image: IMAGES.square }),
    q(hotspot("Kde je červený štvorec na tomto širokom pruhu?", media.banner, IMAGES.banner), { image: IMAGES.banner }),
    // --- text ---------------------------------------------------------------
    q(
      {
        id: randomUUID(),
        type: "text",
        prompt: "Ako sa volá najvyšší vrch Slovenska?",
        ...base,
        data: {
          fields: [{ key: "answer", weight: 1, accepted: ["Gerlachovský štít", "Gerlach", "Gerlachovka"] }],
          tolerance: "normal",
        },
      },
      { wrong: ["Kriváň", "Lomnický štít", "Rysy", "Chopok"], typos: ["gerlachovsky stit", "Gerlachovki štít", "Gerlah"] },
    ),
    q(
      {
        id: randomUUID(),
        type: "text",
        prompt: "Ktorá veľká európska rieka tečie popod mosty v centre Bratislavy?",
        ...base,
        data: { fields: [{ key: "answer", weight: 1, accepted: ["Dunaj"] }], tolerance: "normal" },
      },
      { wrong: ["Váh", "Morava", "Hron"], typos: ["dunaj", "Dunag", "Dunajec"], override: "Danube" },
    ),
    q(
      {
        id: randomUUID(),
        type: "text",
        prompt: "Pesnička sa zastavila pred posledným slovom. Doplň ho: „Tancuj, tancuj, vykrúcaj, vykrúcaj, len mi piecku …“",
        media: { audioId: media.folk },
        ...base,
        data: {
          fields: [{ key: "answer", label: "Chýbajúce slovo", weight: 1, accepted: ["nezbúraj"] }],
          tolerance: "loose",
          clip: { start: 0, duration: 3 },
        },
      },
      { wrong: ["nerozbi", "nezhoď", "nepáľ"], typos: ["nezburaj", "nezbúrej", "zbúraj"] },
    ),
    q(
      {
        id: randomUUID(),
        type: "text",
        prompt:
          "Tento národný buditeľ, jazykovedec, politik, novinár a poslanec uhorského snemu vydával Slovenskje " +
          "národňje novini, viedol slovenských študentov na lýceu v Bratislave a zomrel v roku 1856 v Modre po " +
          "nešťastnom zranení na poľovačke. Ako sa volal? Stačí priezvisko, ale celé meno je tiež v poriadku.",
        ...base,
        points: 2000,
        data: {
          fields: [
            {
              key: "answer",
              label: "Priezvisko alebo celé meno buditeľa",
              weight: 1,
              accepted: ["Štúr", "Ľudovít Štúr", "Ludovit Stur"],
            },
          ],
          tolerance: "strict",
        },
      },
      { wrong: ["Hurban", "Hodža", "Bernolák", "Kollár"], typos: ["Stur", "Ľudovit Šťúr", "Štúrr"] },
    ),
    // --- music --------------------------------------------------------------
    q(
      {
        id: randomUUID(),
        type: "music",
        prompt: "Čo hrá? Napíš interpreta aj názov skladby.",
        media: { audioId: media.song },
        ...base,
        data: {
          clip: { start: 0, duration: 3 },
          fields: [
            { key: "artist", label: "Interpret", weight: 0.5, accepted: ["Elán"] },
            { key: "title", label: "Názov skladby", weight: 0.5, accepted: ["Zaľúbil sa chlapec"] },
          ],
          tolerance: "normal",
        },
      },
      { wrong: ["Team", "Tublatanka", "IMT Smile"], wrongTitles: ["Kaskadér", "Voda čo ma drží nad vodou", "Hotel"] },
    ),
    q(
      {
        id: randomUUID(),
        type: "music",
        prompt: "Spoznáš túto slovenskú klasiku?",
        media: { audioId: media.song },
        ...base,
        data: {
          clip: { start: 1, duration: 2 },
          fields: [
            { key: "artist", label: "Interpret", weight: 0.4, accepted: ["Miroslav Žbirka", "Meky Žbirka", "Žbirka"] },
            { key: "title", label: "Názov skladby", weight: 0.6, accepted: ["Atlantída"] },
          ],
          tolerance: "normal",
        },
      },
      { wrong: ["Peter Nagy", "Richard Müller", "Marika Gombitová"], wrongTitles: ["Balada o poľných vtákoch", "Nechaj ma ísť"] },
    ),
    q(
      {
        id: randomUUID(),
        type: "music",
        prompt:
          "Posledná hudobná otázka: z reproduktorov hostiteľa znie úryvok známej slovenskej rockovej skladby z " +
          "prelomu tisícročí. Napíš názov kapely aj názov skladby, stačí aj s preklepom, za každé správne pole " +
          "dostaneš polovicu bodov. Počúvaj pozorne, úryvok je krátky!",
        media: { audioId: media.folk },
        ...base,
        points: 2000,
        data: {
          clip: { start: 0, duration: 4 },
          fields: [
            { key: "artist", label: "Interpret alebo kapela (aj skratka)", weight: 0.5, accepted: ["Desmod"] },
            {
              key: "title",
              label: "Názov skladby (stačí jeho začiatok)",
              weight: 0.5,
              accepted: ["Zhorí všetko čo mám", "Zhorí všetko"],
            },
          ],
          tolerance: "loose",
        },
      },
      { wrong: ["Horkýže Slíže", "No Name", "Hex"], wrongTitles: ["Kým vieš snívať", "Mám chuť", "Ty a ja"] },
    ),
    // --- number -------------------------------------------------------------
    q({
      id: randomUUID(),
      type: "number",
      prompt: "Koľko metrov nad morom meria Gerlachovský štít? (tolerancia ±10 m)",
      ...base,
      data: { answer: 2655, mode: "tolerance", tolerance: 10 },
    }),
    q({
      id: randomUUID(),
      type: "number",
      prompt: "Koľko obyvateľov mala Bratislava podľa sčítania v roku 2021? Vyhráva najbližší tip.",
      ...base,
      data: { answer: 475503, mode: "closest", tolerance: 0 },
    }),
    q({
      id: randomUUID(),
      type: "number",
      prompt: "Koľko je číslo π zaokrúhlené na dve desatinné miesta?",
      ...base,
      points: 500,
      data: { answer: 3.14, mode: "tolerance", tolerance: 0 },
    }),
    q({
      id: randomUUID(),
      type: "number",
      prompt:
        "Dunaj je po Volge druhou najdlhšou riekou Európy. Pramení v Čiernom lese v Nemecku, preteká desiatimi " +
        "štátmi vrátane Slovenska a štyrmi hlavnými mestami a vlieva sa do Čierneho mora. Koľko kilometrov je " +
        "približne dlhý? Body dostanú iba tí, ktorých tip je najbližšie k správnej hodnote.",
      ...base,
      points: 2000,
      data: { answer: 2850, mode: "closest", tolerance: 0 },
    }),
  ];
  return { items, extras };
}

// ---------------------------------------------------------------------------
// Answers: correct / partial / wrong / none
// ---------------------------------------------------------------------------

type Outcome = "correct" | "partial" | "wrong" | "none";

function correctAnswer(q: Question, extra: Extra): unknown {
  switch (q.type) {
    case "single":
      return { optionId: q.data.correctId };
    case "multi":
      return { optionIds: shuffled(q.data.correctIds) };
    case "order":
      return { order: q.data.items.map((i) => i.id) };
    case "hotspot": {
      const t = q.data.targets[0];
      const image = extra.image;
      if (!t || !image) fail("hotspot without a target / image size");
      const dx = between(-0.4, 0.4) * t.r;
      const dy = between(-0.4, 0.4) * t.r * (image.width / image.height);
      return { x: clamp01(t.x + dx), y: clamp01(t.y + dy) };
    }
    case "text":
      return { answers: { answer: pick(q.data.fields[0].accepted) } };
    case "music":
      return { answers: { artist: pick(q.data.fields[0].accepted), title: pick(q.data.fields[1].accepted) } };
    case "number":
      return { value: q.data.answer };
  }
}

function wrongAnswer(q: Question, extra: Extra): unknown {
  switch (q.type) {
    case "single":
      return { optionId: pick(q.data.options.filter((o) => o.id !== q.data.correctId)).id };
    case "multi": {
      const wrong = q.data.options.filter((o) => !q.data.correctIds.includes(o.id)).map((o) => o.id);
      return { optionIds: wrong.length > 0 ? [pick(wrong)] : [pick(q.data.correctIds)] };
    }
    case "order":
      return { order: q.data.items.map((i) => i.id).reverse() };
    case "hotspot": {
      const t = q.data.targets[0];
      if (!t) fail("hotspot without a target");
      // Opposite corner of the image.
      return { x: t.x > 0.5 ? between(0, 0.2) : between(0.8, 1), y: t.y > 0.5 ? between(0, 0.2) : between(0.8, 1) };
    }
    case "text":
      return { answers: { answer: pick(extra.wrong ?? ["neviem"]) } };
    case "music":
      return { answers: { artist: pick(extra.wrong ?? ["neviem"]), title: pick(extra.wrongTitles ?? ["neviem"]) } };
    case "number": {
      const off = Math.max(Math.abs(q.data.answer) * between(0.15, 0.6), 50);
      return { value: roundTo(q.data.answer + (rand() < 0.5 ? -off : off), q.data.answer % 1 === 0 ? 0 : 2) };
    }
  }
}

/** Partially correct where the type allows it; otherwise a near miss / typo (may still be judged either way). */
function partialAnswer(q: Question, extra: Extra): unknown {
  switch (q.type) {
    case "single":
      return wrongAnswer(q, extra);
    case "multi": {
      const correct = shuffled(q.data.correctIds);
      const wrong = q.data.options.filter((o) => !q.data.correctIds.includes(o.id)).map((o) => o.id);
      if (correct.length > 1 && (rand() < 0.5 || wrong.length === 0)) {
        return { optionIds: correct.slice(0, Math.max(1, correct.length - 1)) };
      }
      return { optionIds: [...correct, pick(wrong)] };
    }
    case "order": {
      const ids = q.data.items.map((i) => i.id);
      const at = Math.floor(rand() * (ids.length - 1));
      const a = ids[at] as string;
      ids[at] = ids[at + 1] as string;
      ids[at + 1] = a;
      return { order: ids };
    }
    case "hotspot": {
      const t = q.data.targets[0];
      if (!t) fail("hotspot without a target");
      // Just outside the target circle.
      const x = t.x + (t.x > 0.5 ? -1.8 : 1.8) * t.r;
      return { x: clamp01(x), y: t.y };
    }
    case "text":
      return { answers: { answer: pick(extra.typos ?? ["neviem"]) } };
    case "music":
      return rand() < 0.5
        ? { answers: { artist: pick(q.data.fields[0].accepted), title: pick(extra.wrongTitles ?? ["neviem"]) } }
        : { answers: { artist: pick(extra.wrong ?? ["neviem"]), title: pick(q.data.fields[1].accepted) } };
    case "number": {
      const step = q.data.mode === "tolerance" ? Math.max(q.data.tolerance, 0.01) : Math.max(Math.abs(q.data.answer) * 0.02, 1);
      const decimals = q.data.answer % 1 === 0 && step >= 1 ? 0 : 2;
      return { value: roundTo(q.data.answer + (rand() < 0.5 ? -1 : 1) * between(0.3, 1.5) * step, decimals) };
    }
  }
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, Math.round(v * 10_000) / 10_000));
}

function roundTo(v: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(v * f) / f;
}

// ---------------------------------------------------------------------------
// Players
// ---------------------------------------------------------------------------

const NICKNAMES = [
  "Janko Hraško",
  "Zuzka",
  "Matúš",
  "Lucia K.",
  "Peťo z 3.B",
  "Dominika",
  "Šimon",
  "Kristínka",
  "Tomáš B.",
  "Ema",
  "Marek Kvízmajster",
  "Natália",
  "Jakub",
  "Veronika",
  "Samko",
  "Laura",
  "Filip",
  "Terézia",
  "Adam",
  "Nikola",
  "Ondrej",
  "Barbora",
  "Maximilián Kováčik",
  "Sofia",
  "Kubo",
  "Miška",
  "Rasťo",
  "Vierka",
  "Juraj",
  "Alžbeta",
];

function randomAvatar(): Avatar {
  const optional = (variants: number) => (rand() < 0.4 ? null : Math.floor(rand() * variants));
  return {
    body: Math.floor(rand() * 5),
    head: Math.floor(rand() * 5),
    glasses: optional(3),
    hat: optional(3),
    mustache: optional(3),
  };
}

interface Bot {
  nickname: string;
  avatar: Avatar;
  ip: string | undefined;
  socket: Socket;
  /** Probability of a correct answer, of no answer, and the typical answer time as a fraction of the limit. */
  skill: number;
  silence: number;
  pace: number;
  playerId: string | null;
  closing: boolean;
  /** First receipt time (performance.now) by `event#index`. */
  received: Map<string, number>;
  /** Receipt times of every `player:result` by question index (re-sent after an override). */
  results: Map<number, { at: number; correctness: number; answered: boolean }[]>;
  /** Precomputed per question index (deterministic for a seed). */
  plans: Map<number, Plan>;
  finished: GameFinishedEvent | null;
  /** `GET /exists` → 429 (the web client then shows "game not found") and `player:join` → RATE_LIMITED. */
  existsLimited: number;
  joinLimited: number;
}

interface Plan {
  outcome: Outcome;
  payload: unknown;
  /** Answer delay after receiving `question:start`. */
  delayMs: number;
}

let items: QuizItem[] = [];
let extras = new Map<string, Extra>();
/** Index of the question with the planned host override. */
let overrideIndex = -1;
let overrideBots = new Set<Bot>();

function tick(): void {
  bus.emit("tick");
}

function createBot(i: number, pin: string): Bot {
  const nickname = NICKNAMES[i] ?? `Hráč ${i + 1}`;
  const ip = DISTINCT_IPS ? `10.77.${Math.floor(i / 250)}.${(i % 250) + 1}` : undefined;
  const socket = io(`${BASE_URL}/play`, {
    transports: ["websocket"],
    forceNew: true,
    reconnection: false,
    autoConnect: false,
    auth: { pin },
    ...(ip ? { extraHeaders: { "cf-connecting-ip": ip } } : {}),
  });
  const bot: Bot = {
    nickname,
    avatar: randomAvatar(),
    ip,
    socket,
    skill: between(0.3, 0.95),
    silence: between(0.03, 0.15),
    pace: between(0.15, 0.85),
    playerId: null,
    closing: false,
    received: new Map(),
    results: new Map(),
    plans: new Map(),
    finished: null,
    existsLimited: 0,
    joinLimited: 0,
  };
  const mark = (event: string, index: number) => {
    const key = `${event}#${index}`;
    if (!bot.received.has(key)) bot.received.set(key, performance.now());
  };
  socket.on("question:start", (raw: unknown) => {
    const start = parse(questionStartEventSchema, raw, `${nickname} question:start`);
    mark("question:start", start.index);
    scheduleAnswer(bot, start.index);
    tick();
  });
  socket.on("page:show", (raw: unknown) => {
    mark("page:show", parse(pageShowEventSchema, raw, `${nickname} page:show`).index);
    tick();
  });
  socket.on("question:end", (raw: unknown) => {
    mark("question:end", parse(questionEndEventSchema, raw, `${nickname} question:end`).index);
    tick();
  });
  socket.on("player:result", (raw: unknown) => {
    const at = performance.now();
    const result = parse(playerResultEventSchema, raw, `${nickname} player:result`);
    const list = bot.results.get(result.index) ?? [];
    list.push({ at, correctness: result.correctness, answered: result.yourAnswer !== null });
    bot.results.set(result.index, list);
    tick();
  });
  socket.on("leaderboard", (raw: unknown) => {
    mark("leaderboard", parse(leaderboardEventSchema, raw, `${nickname} leaderboard`).index);
    tick();
  });
  socket.on("game:finished", (raw: unknown) => {
    bot.finished = parse(gameFinishedEventSchema, raw, `${nickname} game:finished`);
    mark("game:finished", 0);
    tick();
  });
  socket.on("player:kicked", () => {
    countError("player:kicked");
    tick();
  });
  socket.on("disconnect", (reason: string) => {
    if (!bot.closing) {
      countError(`disconnect:${reason}`);
      findings.push(`${nickname} disconnected unexpectedly (${reason})`);
    }
    tick();
  });
  return bot;
}

function questionAt(index: number): Question {
  const item = items[index];
  if (!item || isPage(item)) fail(`item ${index} is not a question`);
  return item;
}

/** Decides every bot's outcome, payload and delay for every question up front (one seeded sequence). */
function planAnswers(bots: Bot[]): void {
  for (const bot of bots) {
    for (const [index, item] of items.entries()) {
      if (isPage(item)) continue;
      const extra = extras.get(item.id) ?? {};
      let outcome: Outcome;
      let payload: unknown = null;
      if (index === overrideIndex && overrideBots.has(bot) && extra.override) {
        outcome = "wrong";
        payload = { answers: { answer: extra.override } };
      } else {
        if (rand() < bot.silence) outcome = "none";
        else if (rand() < bot.skill) outcome = "correct";
        else outcome = rand() < 0.5 ? "partial" : "wrong";
        if (outcome === "correct") payload = correctAnswer(item, extra);
        else if (outcome === "partial") payload = partialAnswer(item, extra);
        else if (outcome === "wrong") payload = wrongAnswer(item, extra);
      }
      // Answer time spread over the limit (speed factor varies), at least 0.7 s before the deadline.
      const limitMs = item.timeLimit * 1000;
      const delayMs = Math.round(Math.min(limitMs - 700, Math.max(250, (bot.pace + between(-0.25, 0.25)) * limitMs)));
      bot.plans.set(index, { outcome, payload, delayMs });
    }
  }
}

let acceptedAnswers = 0;

function scheduleAnswer(bot: Bot, index: number): void {
  const plan = bot.plans.get(index);
  if (!plan || plan.outcome === "none") return;
  setTimeout(() => {
    const started = performance.now();
    bot.socket
      .timeout(ACK_TIMEOUT_MS)
      .emitWithAck("player:answer", { questionIndex: index, payload: plan.payload })
      .then((raw: unknown) => {
        metrics.answer.add(performance.now() - started);
        const ack = okOrErrorAckSchema.safeParse(raw);
        if (!ack.success) countError("player:answer:UNEXPECTED_ACK");
        else if ("error" in ack.data) countError(`player:answer:${ack.data.error}`);
        else acceptedAnswers++;
      })
      .catch(() => countError("player:answer:ACK_TIMEOUT"))
      .finally(tick);
  }, plan.delayMs);
}

async function connectBot(bot: Bot): Promise<void> {
  const started = performance.now();
  await new Promise<void>((resolve, reject) => {
    bot.socket.once("connect", () => resolve());
    bot.socket.once("connect_error", (err: Error) => reject(new LoadTestFailure(`${bot.nickname}: ${err.message}`)));
    bot.socket.connect();
  });
  metrics.connect.add(performance.now() - started);
}

/** Like the web client: `/exists`, connect, then `player:join` until it is not rate limited. */
async function joinBot(bot: Bot, pin: string): Promise<boolean> {
  for (let i = 0; i < EXISTS_CALLS; i++) {
    const res = await timed(metrics.restExists, () =>
      http(`/api/games/${pin}/exists`, { auth: false, ...(bot.ip ? { headers: { "cf-connecting-ip": bot.ip } } : {}) }),
    );
    const text = await res.text();
    if (res.status === 429) {
      countError("GET /exists:RATE_LIMITED");
      bot.existsLimited++;
    }
    else if (res.status !== 200 || !parse(gameExistsResponseSchema, JSON.parse(text), "exists").exists) {
      countError(`GET /exists:HTTP_${res.status}`);
    }
  }
  await connectBot(bot);
  const firstTry = performance.now();
  for (;;) {
    const started = performance.now();
    let raw: unknown;
    try {
      raw = await bot.socket
        .timeout(ACK_TIMEOUT_MS)
        .emitWithAck("player:join", { pin, nickname: bot.nickname, avatar: bot.avatar });
    } catch {
      countError("player:join:ACK_TIMEOUT");
      return false;
    }
    const took = performance.now() - started;
    const ack = parse(playerJoinAckSchema, raw, `${bot.nickname} player:join ack`);
    if ("token" in ack) {
      metrics.join.add(took);
      metrics.joinWait.add(performance.now() - firstTry);
      bot.playerId = ack.playerId;
      return true;
    }
    countError(`player:join:${ack.error}`);
    if (ack.error === "RATE_LIMITED") bot.joinLimited++;
    if (ack.error !== "RATE_LIMITED" || performance.now() - firstTry > JOIN_GIVE_UP_MS) return false;
    await sleep(JOIN_RETRY_MS);
  }
}

// ---------------------------------------------------------------------------
// Host
// ---------------------------------------------------------------------------

interface HostEvent {
  at: number;
  wall: number;
  payload: unknown;
}

class Host {
  readonly socket: Socket;
  private readonly events = new Map<string, HostEvent[]>();

  constructor() {
    this.socket = io(`${BASE_URL}/host`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      extraHeaders: { cookie },
    });
    this.socket.onAny((event: string, ...args: unknown[]) => {
      const payload = args[0];
      const index =
        payload !== null && typeof payload === "object" && "index" in payload && typeof payload.index === "number"
          ? payload.index
          : 0;
      const key = `${event}#${index}`;
      const list = this.events.get(key) ?? [];
      list.push({ at: performance.now(), wall: Date.now(), payload });
      this.events.set(key, list);
      tick();
    });
    this.socket.on("disconnect", (reason: string) => {
      if (!closingAll) {
        countError(`host disconnect:${reason}`);
        findings.push(`host disconnected unexpectedly (${reason})`);
      }
    });
  }

  connected(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket.connected) return resolve();
      this.socket.once("connect", () => resolve());
      this.socket.once("connect_error", (err: Error) => reject(new LoadTestFailure(`host: ${err.message}`)));
    });
  }

  /** Payload of the latest `event` (index 0 for events without an index). */
  last(event: string, index = 0): unknown {
    return this.events.get(`${event}#${index}`)?.at(-1)?.payload;
  }

  count(event: string, index = 0): number {
    return this.events.get(`${event}#${index}`)?.length ?? 0;
  }

  async next<T>(event: string, schema: z.ZodType<T>, index = 0, nth = 1): Promise<T & { at: number; wall: number }> {
    await waitUntil(() => this.count(event, index) >= nth, `host ${event} #${index}`);
    const entry = this.events.get(`${event}#${index}`)?.[nth - 1];
    if (!entry) fail(`host ${event} #${index} missing`);
    return { ...parse(schema, entry.payload, `host ${event}`), at: entry.at, wall: entry.wall };
  }

  /** Emits a host command, returns the emit time (performance.now) for fan-out measurements. */
  async command(event: string, payload?: unknown): Promise<number> {
    const started = performance.now();
    const raw: unknown =
      payload === undefined
        ? await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event)
        : await this.socket.timeout(ACK_TIMEOUT_MS).emitWithAck(event, payload);
    const took = performance.now() - started;
    const ack = parse(okOrErrorAckSchema, raw, `${event} ack`);
    if ("error" in ack) {
      countError(`${event}:${ack.error}`);
      fail(`${event} → ${ack.error}`);
    }
    if (event === "host:override") metrics.overrideAck.add(took);
    else metrics.hostAck.add(took);
    return started;
  }
}

let closingAll = false;
/** For the cleanup in `finally`. */
let hostRef: Host | null = null;
const allBots: Bot[] = [];

// ---------------------------------------------------------------------------
// Scenario
// ---------------------------------------------------------------------------

async function login(): Promise<void> {
  const res = await timed(metrics.restLogin, () =>
    http("/api/auth/login", { method: "POST", json: { password: ADMIN_PASSWORD } }),
  );
  await json(res, 200, "login (is ADMIN_PASSWORD right?)");
  const session = res.headers.getSetCookie().find((c) => c.startsWith("nexquiz_session="));
  if (!session) fail("login did not set the session cookie");
  cookie = session.split(";")[0] ?? "";
}

async function uploadMedia(): Promise<MediaIds> {
  const images = {} as Record<ImageKey, string>;
  for (const [key, spec] of Object.entries(IMAGES) as [ImageKey, ImageSpec][]) {
    images[key] = await upload(`loadtest-${key}.png`, "image/png", generatePng(spec.width, spec.height, spec.spot));
  }
  const song = await upload("loadtest-song.mp3", "audio/mpeg", generateMp3(3));
  const folk = await upload("loadtest-folk.mp3", "audio/mpeg", generateMp3(4));
  return { ...images, song, folk };
}

async function createQuiz(): Promise<string> {
  const media = await uploadMedia();
  const built = buildQuiz(media);
  items = built.items;
  extras = built.extras;
  const questionTotal = items.filter((i) => !isPage(i)).length;
  const types = new Set(items.filter((i) => !isPage(i)).map((i) => i.type));
  console.log(`  quiz: ${questionTotal} questions (${[...types].join(", ")}) + ${items.length - questionTotal} pages`);

  const title = "Záťažový test – 30 otázok";
  const created = parse(
    quizDtoSchema,
    await json(await http("/api/quizzes", { method: "POST", json: { title } }), 201, "create quiz"),
    "create quiz",
  );
  const body: QuizUpdateRequest = {
    title,
    description: `Automatický záťažový test (${PLAYER_COUNT} hráčov, seed ${SEED}, ${new Date().toISOString()}).`,
    settings: { speedBonus: true, showLeaderboardAfterEach: true, shuffleOptions: true },
    questions: items,
  };
  // Local validation first: a clear message instead of a bare 400 INVALID.
  const local = quizUpdateRequestSchema.safeParse(body);
  if (!local.success) fail(`quiz does not pass the shared schema: ${local.error.message}`);
  const res = await timed(metrics.restSaveQuiz, () =>
    http(`/api/quizzes/${created.id}`, { method: "PUT", json: body }),
  );
  parse(quizDtoSchema, await json(res, 200, "save quiz"), "save quiz");
  return created.id;
}

function fanOut(bots: Bot[], key: string, since: number, samples: Samples, spread?: Samples): void {
  const times = bots.map((b) => b.received.get(key)).filter((t): t is number => t !== undefined);
  for (const t of times) samples.add(t - since);
  if (spread && times.length > 1) spread.add(Math.max(...times) - Math.min(...times));
}

function hostPause(): Promise<void> {
  return sleep(HOST_PAUSE_MS);
}

interface QuestionLog {
  number: number;
  type: string;
  answered: number;
  endedBy: "all answered" | "timer";
  startP95: number;
  resultP95: number;
  mix: Record<Outcome, number>;
}

async function playGame(quizId: string): Promise<{ gameId: string; pin: string; ranking: GameFinishedEvent | null }> {
  const created = parse(
    createGameResponseSchema,
    await json(
      await timed(metrics.restCreateGame, () => http("/api/games", { method: "POST", json: { quizId } })),
      201,
      "create game",
    ),
    "create game",
  );
  const { pin, gameId } = created;
  console.log(`  game ${pin} (${gameId})`);

  const host = new Host();
  hostRef = host;
  await host.connected();
  const attached = parse(hostGameStateSchema, await host.socket.timeout(ACK_TIMEOUT_MS).emitWithAck("host:attach", { pin }), "host:attach");
  if (attached.state !== "LOBBY") fail(`host:attach state ${attached.state}`);

  // --- lobby ------------------------------------------------------------------
  console.log(`\n# Lobby: ${PLAYER_COUNT} players join${DISTINCT_IPS ? " (distinct simulated IPs)" : " from ONE IP (classroom behind NAT)"}`);
  for (let i = 0; i < PLAYER_COUNT; i++) allBots.push(createBot(i, pin));
  const joinStarted = performance.now();
  // Players arrive one by one (`LOADTEST_ARRIVAL_MS` apart), like a class scanning the QR code.
  const joined = await Promise.all(
    allBots.map(async (bot, i) => {
      await sleep(i * ARRIVAL_MS);
      return joinBot(bot, pin);
    }),
  );
  const bots = allBots.filter((_, i) => joined[i]);
  const joinSeconds = (performance.now() - joinStarted) / 1000;
  console.log(`  ${bots.length} / ${PLAYER_COUNT} players joined in ${joinSeconds.toFixed(1)} s`);
  if (bots.length < PLAYER_COUNT) findings.push(`${PLAYER_COUNT - bots.length} players could not join at all`);
  reportRateLimits(joinSeconds);
  if (bots.length === 0) fail("no player joined");
  await waitUntil(() => lobbyConnected(host) >= bots.length, "host lobby with every player");

  // Three players answer the override question with an unaccepted word; the host accepts it.
  overrideIndex = items.findIndex((i) => !isPage(i) && i.type === "text" && extras.get(i.id)?.override !== undefined);
  overrideBots = new Set(bots.filter((_, i) => i % 8 === 3));
  planAnswers(bots);

  // --- questions ----------------------------------------------------------------
  console.log(`\n# Game: ${items.length} items, time limit ${TIME_LIMIT} s, host pause ${HOST_PAUSE_MS} ms`);
  const logs: QuestionLog[] = [];
  let sentAt = await host.command("host:start");
  const lastQuestion = items.reduce((last, item, i) => (isPage(item) ? last : i), -1);

  for (const [index, item] of items.entries()) {
    if (isPage(item)) {
      await host.next("page:show", pageShowEventSchema, index);
      await waitUntil(() => bots.every((b) => b.received.has(`page:show#${index}`)), `page:show #${index} for every player`);
      fanOut(bots, `page:show#${index}`, sentAt, metrics.pageShow);
      console.log(`  page  "${item.title}"`);
      await hostPause();
      sentAt = await host.command("host:next");
      continue;
    }

    const start = await host.next("question:start", questionStartEventSchema, index);
    await waitUntil(
      () => bots.every((b) => b.received.has(`question:start#${index}`)),
      `question:start #${index} for every player`,
    );
    fanOut(bots, `question:start#${index}`, sentAt, metrics.questionStart, metrics.questionStartSpread);
    const startSamples = new Samples();
    fanOut(bots, `question:start#${index}`, sentAt, startSamples);

    const end = await host.next("question:end", questionEndEventSchema, index, 1);
    const reveal = await host.next("question:reveal", questionRevealEventSchema, index, 1);
    metrics.revealAfterEnd.add(reveal.at - end.at);
    const answeredCount = bots.filter((b) => b.plans.get(index)?.outcome !== "none").length;
    const endedBy = answeredCount === bots.length ? "all answered" : "timer";
    if (endedBy === "timer") {
      // Host clock offset from `serverNow` (same machine: one-way latency is negligible).
      const offset = start.wall - start.serverNow;
      metrics.timerLag.add(end.wall - (start.deadline + ANSWER_GRACE_MS + offset));
    }
    await waitUntil(() => bots.every((b) => b.results.has(index)), `player:result #${index} for every player`);
    const resultSamples = new Samples();
    for (const b of bots) {
      const first = b.results.get(index)?.[0];
      if (first) {
        metrics.resultAfterEnd.add(first.at - end.at);
        resultSamples.add(first.at - end.at);
      }
    }

    if (index === overrideIndex) await hostOverride(host, bots, index, reveal);

    const mix: Record<Outcome, number> = { correct: 0, partial: 0, wrong: 0, none: 0 };
    for (const b of bots) {
      const r = b.results.get(index)?.at(-1);
      if (!r || !r.answered) mix.none++;
      else if (r.correctness >= 1) mix.correct++;
      else if (r.correctness > 0) mix.partial++;
      else mix.wrong++;
    }
    const log: QuestionLog = {
      number: start.number,
      type: start.type,
      answered: answeredCount,
      endedBy,
      startP95: startSamples.stats()?.p95 ?? 0,
      resultP95: resultSamples.stats()?.p95 ?? 0,
      mix,
    };
    logs.push(log);
    console.log(
      `  Q${String(log.number).padStart(2)} ${log.type.padEnd(7)} answered ${String(log.answered).padStart(2)}/${bots.length}` +
        ` ended by ${log.endedBy.padEnd(12)} start p95 ${ms(log.startP95).padStart(7)}  result p95 ${ms(log.resultP95).padStart(7)}` +
        `  ✓${mix.correct} ~${mix.partial} ✗${mix.wrong} –${mix.none}`,
    );

    await hostPause();
    sentAt = await host.command("host:next"); // → LEADERBOARD
    await host.next("leaderboard", leaderboardEventSchema, index);
    await waitUntil(() => bots.every((b) => b.received.has(`leaderboard#${index}`)), `leaderboard #${index} for every player`);
    fanOut(bots, `leaderboard#${index}`, sentAt, metrics.leaderboard);
    await hostPause();

    if (index === lastQuestion && KEEP_OPEN) {
      console.log("  LOADTEST_KEEP_OPEN=1: stopping before game:finished");
      return { gameId, pin, ranking: null };
    }
    sentAt = await host.command("host:next"); // → next item or FINISHED
  }

  const finished = await host.next("game:finished", gameFinishedEventSchema, 0);
  await waitUntil(() => bots.every((b) => b.finished !== null), "game:finished for every player");
  fanOut(bots, "game:finished#0", sentAt, metrics.finished);
  return { gameId, pin, ranking: finished };
}

function reportRateLimits(joinSeconds: number): void {
  const existsHit = allBots.filter((b) => b.existsLimited > 0).length;
  const joinHit = allBots.filter((b) => b.joinLimited > 0).length;
  if (existsHit > 0) {
    findings.push(
      `GET /exists rate limit (EXISTS_RATE_LIMIT_PER_MIN per IP): ${existsHit} of ${allBots.length} players got 429 ` +
        `(${EXISTS_CALLS} call(s) per player); the web client shows "too many attempts" with a retry`,
    );
  }
  if (joinHit > 0) {
    findings.push(
      `player:join rate limit (JOIN_RATE_LIMIT_PER_MIN per IP + PIN): ${joinHit} of ${allBots.length} players got RATE_LIMITED ` +
        `(${allBots.reduce((s, b) => s + b.joinLimited, 0)} rejected attempts with a ${JOIN_RETRY_MS / 1000} s retry); ` +
        `all players were in the lobby only after ${joinSeconds.toFixed(0)} s`,
    );
  }
}

function lobbyConnected(h: Host): number {
  const raw = h.last("lobby:players");
  if (raw === undefined) return 0;
  return parse(lobbyPlayersEventSchema, raw, "host lobby:players").players.filter((p) => p.connected).length;
}

async function hostOverride(
  host: Host,
  bots: Bot[],
  index: number,
  reveal: z.infer<typeof questionRevealEventSchema>,
): Promise<void> {
  const q = questionAt(index);
  const word = extras.get(q.id)?.override;
  if (reveal.stats.type !== "text" || !word) return;
  const group = reveal.stats.fields[0]?.groups.find((g) => !g.accepted && g.examples.includes(word));
  if (!group) {
    findings.push(`override: no unaccepted group "${word}" in the reveal of question ${index}`);
    return;
  }
  const affected = bots.filter((b) => JSON.stringify(b.plans.get(index)?.payload ?? null).includes(word));
  const sentAt = await host.command("host:override", {
    questionIndex: index,
    fieldKey: "answer",
    normalized: group.normalized,
    accept: true,
  });
  await host.next("question:reveal", questionRevealEventSchema, index, 2);
  await waitUntil(() => affected.every((b) => (b.results.get(index)?.length ?? 0) >= 2), "re-sent player:result after override");
  for (const b of affected) {
    const second = b.results.get(index)?.[1];
    if (second) metrics.overrideResult.add(second.at - sentAt);
    if (second && second.correctness !== 1) findings.push(`override: ${b.nickname} still has correctness ${second.correctness}`);
  }
  console.log(`  host:override "${group.normalized}" accepted → ${affected.length} players recalculated`);
}

async function checkResults(gameId: string, bots: number): Promise<void> {
  const res = await timed(metrics.restResults, () => http(`/api/games/${gameId}/results`));
  const results = parse(gameResultsResponseSchema, await json(res, 200, "results"), "results");
  const okAnswers = acceptedAnswers;
  console.log(
    `  persisted: ${results.players.length} players, ${results.questions.length} questions, ${results.answers.length} answers (accepted acks: ${okAnswers})`,
  );
  if (results.players.length !== bots) findings.push(`results list ${results.players.length} players, expected ${bots}`);
  if (results.answers.length !== okAnswers) {
    findings.push(`results contain ${results.answers.length} answers, but ${okAnswers} answers were acknowledged`);
  }
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function ms(value: number): string {
  return `${value.toFixed(value < 10 ? 1 : 0)} ms`;
}

function printMetrics(): void {
  console.log("\n# Responsiveness (ms)");
  const header = ["metric", "count", "min", "median", "p95", "max"];
  const rows: string[][] = [];
  for (const [key, samples] of Object.entries(metrics) as [keyof typeof metrics, Samples][]) {
    const s = samples.stats();
    if (!s) continue;
    const f = (v: number) => v.toFixed(1);
    rows.push([METRIC_LABELS[key], String(s.count), f(s.min), f(s.median), f(s.p95), f(s.max)]);
  }
  printTable(header, rows, [false, true, true, true, true, true]);
}

function printTable(header: string[], rows: string[][], alignRight: boolean[]): void {
  const widths = header.map((h, c) => Math.max(h.length, ...rows.map((r) => (r[c] ?? "").length)));
  const line = (cells: string[]) =>
    cells.map((cell, c) => (alignRight[c] ? cell.padStart(widths[c] ?? 0) : cell.padEnd(widths[c] ?? 0))).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
}

function printErrors(): void {
  console.log("\n# Error acks, failures and disconnects");
  if (errors.size === 0) {
    console.log("  none");
    return;
  }
  for (const [key, count] of [...errors.entries()].sort()) console.log(`  ${key.padEnd(40)} ${count}`);
}

function printRanking(finished: GameFinishedEvent): void {
  console.log("\n# Final ranking (game:finished)");
  printTable(
    ["rank", "nickname", "score"],
    finished.ranking.map((r) => [String(r.rank), r.nickname, r.score.toFixed(2)]),
    [true, false, true],
  );
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  if (ADMIN_PASSWORD === "") fail("set ADMIN_PASSWORD (or LOADTEST_ADMIN_PASSWORD / SMOKE_ADMIN_PASSWORD)");
  if (PLAYER_COUNT < 1) fail("LOADTEST_PLAYERS must be at least 1");
  console.log(`NexQuiz load test against ${BASE_URL}: ${PLAYER_COUNT} players, seed ${SEED}`);
  const loop = monitorEventLoopDelay({ resolution: 10 });
  loop.enable();

  console.log("\n# Setup");
  await login();
  const quizId = await createQuiz();
  const { gameId, pin, ranking } = await playGame(quizId);

  console.log("\n# Persistence");
  if (ranking) await checkResults(gameId, ranking.ranking.length);
  else console.log("  skipped (game left open)");

  loop.disable();
  printMetrics();
  console.log(
    `\n  load generator event loop delay: p99 ${(loop.percentile(99) / 1e6).toFixed(1)} ms, max ${(loop.max / 1e6).toFixed(1)} ms` +
      " (client-side noise included in the numbers above)",
  );
  printErrors();
  if (findings.length > 0) {
    console.log("\n# Findings");
    for (const f of findings) console.log(`  - ${f}`);
  }
  if (ranking) printRanking(ranking);

  console.log("\n# Kept for inspection");
  console.log(`  quiz     ${quizId}  ${PUBLIC_URL}/host/quizzes/${quizId}`);
  console.log(`  game PIN ${pin}  (game ${gameId})`);
  if (ranking) console.log(`  results  ${PUBLIC_URL}/host/games/${gameId}/results`);
  else console.log(`  live     ${PUBLIC_URL}/host/games/${pin}  (host:attach resumes the game)`);
  console.log(`  seed     LOADTEST_SEED=${SEED} reproduces answers and delays`);
}

main()
  .then(() => {
    console.log("\nDONE");
    process.exitCode = 0;
  })
  .catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`\nFAIL – ${message}`);
    if (!(err instanceof LoadTestFailure) && err instanceof Error && err.stack) console.error(err.stack);
    printErrors();
    process.exitCode = 1;
  })
  .finally(() => {
    closingAll = true;
    for (const bot of allBots) {
      bot.closing = true;
      bot.socket.disconnect();
    }
    hostRef?.socket.disconnect();
  });
