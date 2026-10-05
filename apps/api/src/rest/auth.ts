import { loginRequestSchema, type AuthMeResponse, type ErrorResponse, type OkAck } from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";
import { isHost, passwordMatches } from "./session.js";
import { parseInput } from "./validation.js";

/** Max. login attempts per IP and minute. */
const LOGIN_RATE_LIMIT = { max: 10, timeWindow: "1 minute" } as const;

/** POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me. */
export async function authRoutes(app: FastifyInstance, opts: { adminPassword: string }): Promise<void> {
  app.post("/api/auth/login", { config: { rateLimit: LOGIN_RATE_LIMIT } }, async (req, reply) => {
    const { password } = parseInput(loginRequestSchema, req.body);
    if (!passwordMatches(password, opts.adminPassword)) {
      req.log.warn("admin login failed");
      const body: ErrorResponse = { error: "WRONG_PASSWORD" };
      return reply.code(401).send(body);
    }
    req.session.regenerate();
    req.session.set("host", true);
    req.log.info("admin logged in");
    const body: OkAck = { ok: true };
    return body;
  });

  app.post("/api/auth/logout", async (req) => {
    req.session.delete();
    const body: OkAck = { ok: true };
    return body;
  });

  app.get("/api/auth/me", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const body: AuthMeResponse = { authenticated: isHost(req) };
    return body;
  });
}
