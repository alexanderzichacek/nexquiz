import type { GameResultsResponse, QuizDto } from "@nexquiz/shared";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp, type AppDeps, type AppServices } from "../app.js";
import { loadConfig } from "../config.js";
import { createHarness, QUIZ_ID, type Harness } from "../test/helpers.js";
import { csvCell, resultsToCsv } from "./csv.js";
import { SESSION_COOKIE } from "./session.js";

const config = loadConfig({
  DATABASE_URL: "postgres://quiz:secret@db:5432/quiz",
  REDIS_URL: "redis://redis:6379",
  ADMIN_PASSWORD: "correct horse",
  SESSION_SECRET: "s".repeat(40),
});

const GAME_ID = "55555555-5555-4555-8555-555555555555";
const PLAYER_ID = "66666666-6666-4666-8666-666666666666";

const results: GameResultsResponse = {
  game: {
    id: GAME_ID,
    quizId: QUIZ_ID,
    quizTitle: "Test quiz",
    pin: "123456",
    status: "finished",
    createdAt: "2026-10-01T10:00:00.000Z",
    startedAt: "2026-10-01T10:01:00.000Z",
    finishedAt: "2026-10-01T10:10:00.000Z",
    playerCount: 1,
    winner: "=Ján, \"the\" best",
  },
  questions: [{ index: 0, type: "single", prompt: "2 + 2?", points: 1 }],
  players: [{ id: PLAYER_ID, nickname: "=Ján, \"the\" best", score: 0.75, finalRank: 1 }],
  answers: [{ questionIndex: 0, playerId: PLAYER_ID, correctness: 1, points: 0.75, answeredMs: 5000 }],
};

function quizDto(title: string): QuizDto {
  return {
    id: QUIZ_ID,
    title,
    description: null,
    settings: { speedBonus: true, showLeaderboardAfterEach: true, shuffleOptions: false },
    questions: [],
    createdAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
  };
}

function fakeServices(h: Harness): AppServices {
  return {
    games: h.games,
    quizzes: {
      list: async () => [],
      get: async () => null,
      create: async (title) => quizDto(title),
      update: async () => null,
      duplicate: async () => null,
      delete: async () => false,
    },
    media: {
      upload: async () => {
        throw new Error("not used");
      },
      get: async () => null,
      storage: {
        save: async () => undefined,
        size: async () => null,
        read: () => {
          throw new Error("not used");
        },
        remove: async () => undefined,
      },
    },
    history: {
      history: async () => [results.game],
      results: async (id) => (id === GAME_ID ? results : null),
    },
  };
}

async function makeApp(h: Harness): Promise<FastifyInstance> {
  const deps: AppDeps = {
    config,
    publicDir: "/nonexistent",
    logLevel: "silent",
    db: { db: {} as AppDeps["db"]["db"], ping: async () => true, close: async () => undefined },
    redis: { redis: {} as AppDeps["redis"]["redis"], ping: async () => true, close: async () => undefined },
    services: () => fakeServices(h),
  };
  return buildApp(deps);
}

/** `name=value` of the session cookie exactly as sent by the server (still URL-encoded). */
function sessionCookie(res: LightMyRequestResponse): string {
  const header = res.headers["set-cookie"];
  const all = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = all.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error("no session cookie");
  return cookie.split(";")[0] ?? "";
}

describe("REST", () => {
  let h: Harness;
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    h = createHarness();
    app = await makeApp(h);
    const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "correct horse" } });
    cookie = sessionCookie(res);
  });

  afterAll(async () => {
    await app.close();
  });

  describe("auth", () => {
    it("rejects a wrong password with WRONG_PASSWORD", async () => {
      const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "nope" } });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "WRONG_PASSWORD" });
      expect(res.cookies).toHaveLength(0);
    });

    it("rejects an invalid body with INVALID", async () => {
      const res = await app.inject({ method: "POST", url: "/api/auth/login", payload: { pass: 1 } });
      expect(res.statusCode).toBe(400);
      expect(res.json()).toEqual({ error: "INVALID" });
    });

    it("sets an httpOnly, sameSite=lax session cookie (secure behind https)", async () => {
      const plain = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "correct horse" } });
      expect(plain.statusCode).toBe(200);
      expect(plain.json()).toEqual({ ok: true });
      const c = plain.cookies.find((x) => x.name === SESSION_COOKIE);
      expect(c).toMatchObject({ httpOnly: true, sameSite: "Lax", path: "/" });
      expect(c?.secure).toBeFalsy();

      const tunnel = await app.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-forwarded-proto": "https" },
        payload: { password: "correct horse" },
      });
      expect(tunnel.cookies.find((x) => x.name === SESSION_COOKIE)?.secure).toBe(true);
    });

    it("reports the session state", async () => {
      expect((await app.inject({ method: "GET", url: "/api/auth/me" })).json()).toEqual({ authenticated: false });
      expect((await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie } })).json()).toEqual({
        authenticated: true,
      });
      expect(
        (await app.inject({ method: "GET", url: "/api/auth/me", headers: { cookie: `${SESSION_COOKIE}=forged` } })).json(),
      ).toEqual({ authenticated: false });
    });

    it("logs out", async () => {
      const login = await app.inject({ method: "POST", url: "/api/auth/login", payload: { password: "correct horse" } });
      const res = await app.inject({ method: "POST", url: "/api/auth/logout", headers: { cookie: sessionCookie(login) } });
      expect(res.json()).toEqual({ ok: true });
      const cleared = res.cookies.find((x) => x.name === SESSION_COOKIE);
      expect(cleared?.value ?? "").toBe("");
    });

    it("rate limits the login", async () => {
      const limited = await makeApp(createHarness());
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await limited.inject({ method: "POST", url: "/api/auth/login", payload: { password: "x" } });
        codes.push(res.statusCode);
        if (res.statusCode === 429) expect(res.json()).toEqual({ error: "RATE_LIMITED" });
      }
      expect(codes.slice(0, 10).every((c) => c === 401)).toBe(true);
      expect(codes[10]).toBe(429);
      await limited.close();
    });

    it("does not reset the login limit for a spoofed X-Forwarded-For", async () => {
      const limited = await makeApp(createHarness());
      const codes: number[] = [];
      for (let i = 0; i < 11; i++) {
        const res = await limited.inject({
          method: "POST",
          url: "/api/auth/login",
          // Rotating left-most entry, same real client (appended by the proxy).
          headers: { "x-forwarded-for": `10.0.0.${i}, 203.0.113.7` },
          payload: { password: "x" },
        });
        codes.push(res.statusCode);
      }
      expect(codes[10]).toBe(429);
      await limited.close();
    });
  });

  describe("host guard", () => {
    it.each([
      ["GET", "/api/quizzes"],
      ["POST", "/api/quizzes"],
      ["GET", `/api/quizzes/${QUIZ_ID}`],
      ["PUT", `/api/quizzes/${QUIZ_ID}`],
      ["POST", `/api/quizzes/${QUIZ_ID}/duplicate`],
      ["DELETE", `/api/quizzes/${QUIZ_ID}`],
      ["POST", "/api/media"],
      ["POST", "/api/games"],
      ["GET", "/api/games"],
      ["GET", "/api/games/123456/qr"],
      ["GET", `/api/games/${GAME_ID}/results`],
    ] as const)("%s %s requires a session", async (method, url) => {
      const res = await app.inject({ method, url });
      expect(res.statusCode).toBe(401);
      expect(res.json()).toEqual({ error: "UNAUTHORIZED" });
    });
  });

  describe("quizzes", () => {
    it("lists and creates", async () => {
      expect((await app.inject({ method: "GET", url: "/api/quizzes", headers: { cookie } })).json()).toEqual([]);
      const created = await app.inject({ method: "POST", url: "/api/quizzes", headers: { cookie } });
      expect(created.statusCode).toBe(201);
      expect(created.json()).toMatchObject({ title: "Nový kvíz", questions: [] });
      const titled = await app.inject({ method: "POST", url: "/api/quizzes", headers: { cookie }, payload: { title: "Môj" } });
      expect(titled.json()).toMatchObject({ title: "Môj" });
    });

    it("validates ids and bodies with the shared schemas", async () => {
      expect((await app.inject({ method: "GET", url: "/api/quizzes/nope", headers: { cookie } })).statusCode).toBe(400);
      const bad = await app.inject({
        method: "PUT",
        url: `/api/quizzes/${QUIZ_ID}`,
        headers: { cookie },
        payload: { title: "", description: null, settings: {}, questions: [{ type: "single" }] },
      });
      expect(bad.statusCode).toBe(400);
      expect(bad.json()).toEqual({ error: "INVALID" });
    });

    it("returns NOT_FOUND for unknown quizzes", async () => {
      const res = await app.inject({ method: "GET", url: `/api/quizzes/${QUIZ_ID}`, headers: { cookie } });
      expect(res.statusCode).toBe(404);
      expect(res.json()).toEqual({ error: "NOT_FOUND" });
      const del = await app.inject({ method: "DELETE", url: `/api/quizzes/${QUIZ_ID}`, headers: { cookie } });
      expect(del.statusCode).toBe(404);
    });
  });

  describe("games", () => {
    it("creates a game and reports it via the public exists endpoint", async () => {
      const res = await app.inject({ method: "POST", url: "/api/games", headers: { cookie }, payload: { quizId: QUIZ_ID } });
      expect(res.statusCode).toBe(201);
      const { pin } = res.json<{ pin: string; gameId: string }>();
      expect(pin).toMatch(/^\d{6}$/);
      expect((await app.inject({ method: "GET", url: `/api/games/${pin}/exists` })).json()).toEqual({ exists: true });
      const other = pin === "000000" ? "000001" : "000000";
      expect((await app.inject({ method: "GET", url: `/api/games/${other}/exists` })).json()).toEqual({ exists: false });
      expect((await app.inject({ method: "GET", url: "/api/games/12ab/exists" })).json()).toEqual({ exists: false });

      const qr = await app.inject({ method: "GET", url: `/api/games/${pin}/qr`, headers: { cookie } });
      expect(qr.statusCode).toBe(200);
      expect(qr.headers["content-type"]).toBe("image/png");
      expect(qr.rawPayload.subarray(1, 4).toString()).toBe("PNG");
    });

    it("rejects an unknown quiz", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/games",
        headers: { cookie },
        payload: { quizId: "77777777-7777-4777-8777-777777777777" },
      });
      expect(res.statusCode).toBe(404);
    });

    it("lists the history and exports results", async () => {
      const list = await app.inject({ method: "GET", url: "/api/games", headers: { cookie } });
      expect(list.json()).toEqual([results.game]);
      const json = await app.inject({ method: "GET", url: `/api/games/${GAME_ID}/results`, headers: { cookie } });
      expect(json.json()).toEqual(results);
      const csv = await app.inject({ method: "GET", url: `/api/games/${GAME_ID}/results?format=csv`, headers: { cookie } });
      expect(csv.headers["content-type"]).toContain("text/csv");
      expect(csv.headers["content-disposition"]).toContain("nexquiz-123456-2026-10-01.csv");
      expect(csv.body).toBe(resultsToCsv(results));
      expect(
        (await app.inject({ method: "GET", url: `/api/games/${GAME_ID}/results?format=xml`, headers: { cookie } })).statusCode,
      ).toBe(400);
    });
  });

  describe("media", () => {
    it("answers 404 for unknown or malformed ids", async () => {
      for (const url of ["/media/not-a-uuid", `/media/${GAME_ID}`]) {
        const res = await app.inject({ method: "GET", url });
        expect(res.statusCode).toBe(404);
        expect(res.json()).toEqual({ error: "NOT_FOUND" });
      }
    });

    it("rejects non-multipart uploads", async () => {
      const res = await app.inject({ method: "POST", url: "/api/media", headers: { cookie }, payload: { a: 1 } });
      expect(res.statusCode).toBe(415);
      expect(res.json()).toEqual({ error: "UNSUPPORTED_MEDIA_TYPE" });
    });
  });
});

describe("CSV export", () => {
  it("quotes cells and neutralizes formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('a "b", c')).toBe('"a ""b"", c"');
    expect(csvCell("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvCell(null)).toBe("");
    expect(csvCell(-1)).toBe("-1");
  });

  it("has a BOM, a header and one row per player", () => {
    const csv = resultsToCsv(results);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv.slice(1).split("\r\n")).toEqual(["rank,nickname,score,Q1", `1,"'=Ján, ""the"" best",0.75,0.75`, ""]);
  });
});
