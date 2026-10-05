import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildApp, type AppDeps } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig({
  DATABASE_URL: "postgres://quiz:secret@db:5432/quiz",
  REDIS_URL: "redis://redis:6379",
  ADMIN_PASSWORD: "admin",
  SESSION_SECRET: "x".repeat(32),
});

function fakeDeps(dbOk: boolean, publicDir: string): AppDeps {
  return {
    config,
    publicDir,
    logLevel: "silent",
    db: { db: {} as AppDeps["db"]["db"], ping: async () => dbOk, close: async () => undefined },
    redis: { redis: {} as AppDeps["redis"]["redis"], ping: async () => true, close: async () => undefined },
  };
}

describe("app", () => {
  let dir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    dir = mkdtempSync(path.join(tmpdir(), "nexquiz-public-"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>NexQuiz</title>");
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "assets", "app-abc123.js"), "console.log(1)");
    app = await buildApp(fakeDeps(true, dir));
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/health reports ok", async () => {
    const res = await app.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", db: true, redis: true });
  });

  it("GET /api/health is 503 when the DB is down", async () => {
    const degraded = await buildApp(fakeDeps(false, dir));
    const res = await degraded.inject({ method: "GET", url: "/api/health" });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toMatchObject({ status: "degraded", db: false });
    await degraded.close();
  });

  it("serves index.html for SPA routes", async () => {
    for (const url of ["/", "/play?pin=123456", "/host/quizzes/abc"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(200);
      expect(res.body).toContain("<title>NexQuiz</title>");
    }
  });

  it("serves hashed assets with immutable caching", async () => {
    const res = await app.inject({ method: "GET", url: "/assets/app-abc123.js" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("returns a JSON 404 for unknown API routes", async () => {
    for (const url of ["/api/nope", "/media/123", "/socket.io/x"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBe(404);
      expect(res.json()).toEqual({ error: "NOT_FOUND" });
    }
  });
});
