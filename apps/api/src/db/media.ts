import { eq } from "drizzle-orm";
import type { Database } from "./client.js";
import { media, type MediaRow } from "./schema.js";

export type MediaInsert = typeof media.$inferInsert;

/** Media metadata (the files themselves live in `MediaStorage`). */
export class MediaRepository {
  constructor(private readonly db: Database) {}

  async insert(row: MediaInsert): Promise<void> {
    await this.db.insert(media).values(row);
  }

  async get(id: string): Promise<MediaRow | null> {
    const [row] = await this.db.select().from(media).where(eq(media.id, id));
    return row ?? null;
  }
}
