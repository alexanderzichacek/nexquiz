import { createHash, timingSafeEqual } from "node:crypto";
import fastifySecureSession from "@fastify/secure-session";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../errors.js";

declare module "@fastify/secure-session" {
  interface SessionData {
    /** Set after a successful admin login. */
    host: boolean;
  }
}

export const SESSION_COOKIE = "nexquiz_session";
/** Session lifetime: 7 days. */
const SESSION_MAX_AGE_S = 7 * 24 * 60 * 60;

/**
 * Encrypted session cookie (`@fastify/secure-session`): httpOnly,
 * `secure` behind https (`auto` uses X-Forwarded-Proto via trustProxy),
 * sameSite lax. The 32-byte key is derived from `SESSION_SECRET`.
 */
export async function registerSession(app: FastifyInstance, secret: string): Promise<void> {
  await app.register(fastifySecureSession, {
    key: createHash("sha256").update(secret).digest(),
    cookieName: SESSION_COOKIE,
    expiry: SESSION_MAX_AGE_S,
    cookie: {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: "auto",
      maxAge: SESSION_MAX_AGE_S,
    },
  });
}

export function isHost(req: FastifyRequest): boolean {
  return req.session.get("host") === true;
}

/** `onRequest` hook for host-only routes: `401 UNAUTHORIZED` without a session. */
export async function requireHost(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!isHost(req)) throw new AppError("UNAUTHORIZED");
}

/** Verifies the session cookie of a raw `Cookie` header (Socket.IO `/host` handshake). */
export function hostCookieVerifier(app: FastifyInstance): (cookieHeader: string | undefined) => boolean {
  return (cookieHeader) => {
    if (!cookieHeader) return false;
    const value = app.parseCookie(cookieHeader)[SESSION_COOKIE];
    if (!value) return false;
    const session = app.decodeSecureSession(value);
    return session?.get("host") === true;
  };
}

/** Constant-time password comparison (hashes first, so lengths never leak). */
export function passwordMatches(candidate: string, expected: string): boolean {
  const a = createHash("sha256").update(candidate).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
