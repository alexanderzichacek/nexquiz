import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const env = {
  DATABASE_URL: "postgres://quiz:secret@db:5432/quiz",
  REDIS_URL: "redis://redis:6379",
  ADMIN_PASSWORD: "admin",
  SESSION_SECRET: "x".repeat(32),
};

describe("loadConfig", () => {
  it("applies defaults", () => {
    const c = loadConfig(env);
    expect(c.PORT).toBe(3000);
    expect(c.MEDIA_DIR).toBe("/data/media");
    expect(c.MAX_IMAGE_MB).toBe(5);
    expect(c.MAX_AUDIO_MB).toBe(15);
    expect(c.GAME_TTL_HOURS).toBe(12);
    expect(c.PUBLIC_URL).toBeUndefined();
    expect(c.JOIN_RATE_LIMIT_PER_MIN).toBe(400);
    expect(c.EXISTS_RATE_LIMIT_PER_MIN).toBe(1000);
  });

  it("parses the rate limits and rejects invalid ones", () => {
    const c = loadConfig({ ...env, JOIN_RATE_LIMIT_PER_MIN: "600", EXISTS_RATE_LIMIT_PER_MIN: "" });
    expect(c.JOIN_RATE_LIMIT_PER_MIN).toBe(600);
    expect(c.EXISTS_RATE_LIMIT_PER_MIN).toBe(1000);
    expect(() => loadConfig({ ...env, JOIN_RATE_LIMIT_PER_MIN: "0" })).toThrow(/JOIN_RATE_LIMIT_PER_MIN/);
    expect(() => loadConfig({ ...env, EXISTS_RATE_LIMIT_PER_MIN: "12.5" })).toThrow(/EXISTS_RATE_LIMIT_PER_MIN/);
    expect(() => loadConfig({ ...env, EXISTS_RATE_LIMIT_PER_MIN: "many" })).toThrow(/EXISTS_RATE_LIMIT_PER_MIN/);
  });

  it("treats empty values as unset and coerces numbers", () => {
    const c = loadConfig({ ...env, PUBLIC_URL: "", PORT: "8080", GAME_TTL_HOURS: "" });
    expect(c.PUBLIC_URL).toBeUndefined();
    expect(c.PORT).toBe(8080);
    expect(c.GAME_TTL_HOURS).toBe(12);
  });

  it("treats a compose inline comment left as the value as empty", () => {
    const c = loadConfig({ ...env, PUBLIC_URL: "# prázdne = odvodí sa z requestu (quick tunnel)" });
    expect(c.PUBLIC_URL).toBeUndefined();
  });

  it("strips the trailing slash of PUBLIC_URL", () => {
    expect(loadConfig({ ...env, PUBLIC_URL: "https://quiz.example.sk/" }).PUBLIC_URL).toBe("https://quiz.example.sk");
  });

  it("rejects a short SESSION_SECRET and missing variables", () => {
    expect(() => loadConfig({ ...env, SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ...env, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
