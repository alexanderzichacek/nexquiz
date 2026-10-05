/** Postgres SQLSTATE of an error thrown by postgres.js (possibly wrapped by Drizzle). */
export function pgErrorCode(err: unknown): string | null {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const code: unknown = Reflect.get(current, "code");
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = Reflect.get(current, "cause");
  }
  return null;
}

export const PG_UNIQUE_VIOLATION = "23505";
export const PG_FOREIGN_KEY_VIOLATION = "23503";
export const PG_INVALID_TEXT = "22P02";
