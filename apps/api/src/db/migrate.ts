import { fileURLToPath } from "node:url";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Database } from "./client.js";

/** `apps/api/drizzle` – resolved the same way from `src/db` (dev) and `dist/db` (prod). */
export const MIGRATIONS_DIR = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
}
