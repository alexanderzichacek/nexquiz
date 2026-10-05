import type { ErrorCode } from "@nexquiz/shared";

/** HTTP status used when an `AppError` reaches the REST layer. */
const STATUS_BY_CODE: Partial<Record<ErrorCode, number>> = {
  PIN_NOT_FOUND: 404,
  NOT_FOUND: 404,
  NICK_TAKEN: 409,
  GAME_FINISHED: 409,
  INVALID_TRANSITION: 409,
  ALREADY_ANSWERED: 409,
  LATE: 409,
  INVALID: 400,
  INVALID_TOKEN: 401,
  UNAUTHORIZED: 401,
  WRONG_PASSWORD: 401,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL: 500,
};

/**
 * Expected domain / validation failure with a stable error code. The message
 * is the code itself, so nothing internal can leak to clients.
 */
export class AppError extends Error {
  readonly statusCode: number;

  constructor(readonly code: ErrorCode) {
    super(code);
    this.name = "AppError";
    this.statusCode = STATUS_BY_CODE[code] ?? 400;
  }
}

export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}
