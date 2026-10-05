import type { ErrorResponse } from "@nexquiz/shared";
import type { z } from "zod";
import { AppError, isAppError } from "../errors.js";
import type { GameLogger } from "../game/ports.js";

type AckFn = (response: unknown) => void;

/**
 * Splits raw Socket.IO listener arguments into payload and ack. Clients are
 * untrusted: the ack is the last argument only when it is a function.
 */
export function splitArgs(args: readonly unknown[]): { payload: unknown; ack: AckFn } {
  const last = args[args.length - 1];
  if (typeof last === "function") {
    const fn = last as AckFn;
    return { payload: args.length > 1 ? args[0] : undefined, ack: (response) => fn(response) };
  }
  return { payload: args[0], ack: () => undefined };
}

/** Maps an error to a stable ack error (unexpected errors are logged, never sent). */
export function toErrorResponse(err: unknown, log: GameLogger, context: object): ErrorResponse {
  if (isAppError(err)) return { error: err.code };
  log.error({ err, ...context }, "socket handler failed");
  return { error: "INTERNAL" };
}

/** Runs a handler and acks with its result or a stable error code. */
export function respond(
  args: readonly unknown[],
  log: GameLogger,
  context: object,
  handler: (payload: unknown) => Promise<unknown>,
): void {
  const { payload, ack } = splitArgs(args);
  handler(payload).then(ack, (err: unknown) => ack(toErrorResponse(err, log, context)));
}

/** Zod-validates an incoming WS payload; failures become `INVALID`. */
export function parsePayload<S extends z.ZodType>(schema: S, payload: unknown): z.infer<S> {
  const result = schema.safeParse(payload);
  if (!result.success) throw new AppError("INVALID");
  return result.data;
}

export const OK = { ok: true } as const;
