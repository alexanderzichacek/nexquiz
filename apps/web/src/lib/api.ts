import { errorResponseSchema, type ErrorCode } from "@nexquiz/shared";
import type { z } from "zod";

/** Error thrown for non-2xx responses, carrying the stable server error code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

let unauthorizedHandler: (() => void) | null = null;

/**
 * Registers what happens when a host endpoint answers `401 UNAUTHORIZED`
 * (expired session): the app drops the session and goes back to `/`.
 * `WRONG_PASSWORD` (also 401) is a normal login error and does not trigger it.
 */
export function setUnauthorizedHandler(handler: () => void): void {
  unauthorizedHandler = handler;
}

async function parseResponse<S extends z.ZodType>(res: Response, schema: S): Promise<z.infer<S>> {
  const json: unknown = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) {
    const parsed = errorResponseSchema.safeParse(json);
    const code: ErrorCode = parsed.success
      ? parsed.data.error
      : res.status === 413
        ? "PAYLOAD_TOO_LARGE"
        : "INTERNAL";
    if (code === "UNAUTHORIZED") unauthorizedHandler?.();
    throw new ApiError(res.status, code);
  }
  return schema.parse(json);
}

/**
 * Same-origin JSON request. The response is validated with `schema`
 * (shared Zod DTO); errors become `ApiError` with a stable code.
 */
export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S,
  options: RequestOptions = {},
): Promise<z.infer<S>> {
  const init: RequestInit = {
    method: options.method ?? "GET",
    credentials: "same-origin",
    headers: options.body === undefined ? {} : { "Content-Type": "application/json" },
    body: options.body === undefined ? null : JSON.stringify(options.body),
  };
  if (options.signal) init.signal = options.signal;
  return parseResponse(await fetch(path, init), schema);
}

/** Multipart upload of one file (field `file`), e.g. `POST /api/media`. */
export async function apiUpload<S extends z.ZodType>(path: string, file: File, schema: S): Promise<z.infer<S>> {
  const form = new FormData();
  form.append("file", file, file.name);
  const res = await fetch(path, { method: "POST", credentials: "same-origin", body: form });
  return parseResponse(res, schema);
}
