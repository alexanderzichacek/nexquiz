import { z } from "zod";

/** Treats empty strings (e.g. `PUBLIC_URL=` in .env) as "not set". */
const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

const positiveNumber = (fallback: number) =>
  z.preprocess(emptyToUndefined, z.coerce.number().positive().default(fallback));

export const configSchema = z.object({
  NODE_ENV: z.preprocess(emptyToUndefined, z.enum(["development", "production", "test"]).default("development")),
  PORT: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).max(65535).default(3000)),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  MEDIA_DIR: z.preprocess(emptyToUndefined, z.string().default("/data/media")),
  ADMIN_PASSWORD: z.string().min(1),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters long"),
  /** Empty = derived from the request (quick tunnel). Trailing slash is removed. */
  PUBLIC_URL: z.preprocess(
    emptyToUndefined,
    z
      .url({ protocol: /^https?$/ })
      .transform((u) => u.replace(/\/+$/, ""))
      .optional(),
  ),
  MAX_IMAGE_MB: positiveNumber(5),
  MAX_AUDIO_MB: positiveNumber(15),
  GAME_TTL_HOURS: positiveNumber(12),
});

export type Config = z.infer<typeof configSchema>;

/**
 * Docker Compose keeps an inline comment as the value when the value itself is
 * empty (`PUBLIC_URL=      # comment` → `"# comment"`). Such values are
 * treated as empty.
 */
function stripCommentValues(env: NodeJS.ProcessEnv): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(env).map(([key, value]) => [key, value?.trim().startsWith("#") ? "" : value]),
  );
}

/** Parses and validates the environment. Throws with a readable message on error. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = configSchema.safeParse(stripCommentValues(env));
  if (!result.success) {
    const details = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${details}`);
  }
  return result.data;
}
