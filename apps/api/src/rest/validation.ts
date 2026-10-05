import type { z } from "zod";
import { AppError } from "../errors.js";

/** Parses untrusted input with a shared Zod schema; failures become `400 INVALID`. */
export function parseInput<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const result = schema.safeParse(data);
  if (!result.success) throw new AppError("INVALID");
  return result.data;
}
