import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema.js";

export type Database = PostgresJsDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  /** Pings the database; resolves to false instead of throwing. */
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

export function createDb(url: string): DbHandle {
  const client = postgres(url, { max: 10, onnotice: () => undefined });
  const db = drizzle(client, { schema });
  return {
    db,
    async ping() {
      try {
        await client`select 1`;
        return true;
      } catch {
        return false;
      }
    },
    async close() {
      await client.end({ timeout: 5 });
    },
  };
}
