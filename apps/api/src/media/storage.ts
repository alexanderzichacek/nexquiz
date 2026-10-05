import { createReadStream } from "node:fs";
import { mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";

export interface ByteRange {
  /** Inclusive. */
  start: number;
  /** Inclusive. */
  end: number;
}

/**
 * Storage of media files (`{id}.{ext}`). Swapping to S3 / MinIO later only
 * means another implementation of this interface.
 */
export interface MediaStorage {
  save(name: string, data: Buffer): Promise<void>;
  /** Size in bytes, or null when the file does not exist. */
  size(name: string): Promise<number | null>;
  read(name: string, range?: ByteRange): Readable;
  remove(name: string): Promise<void>;
}

/** Only `{uuid}.{ext}` names are accepted (no path traversal). */
const NAME_PATTERN = /^[0-9a-f-]{36}\.[a-z0-9]{2,5}$/;

function assertName(name: string): void {
  if (!NAME_PATTERN.test(name)) throw new Error(`Invalid media file name: ${name}`);
}

/** Local-disk implementation (`MEDIA_DIR`, Docker volume `media`). */
export class LocalDiskMediaStorage implements MediaStorage {
  private ready: Promise<void> | null = null;

  constructor(private readonly dir: string) {}

  private ensureDir(): Promise<void> {
    this.ready ??= mkdir(this.dir, { recursive: true }).then(() => undefined);
    return this.ready;
  }

  private file(name: string): string {
    assertName(name);
    return path.join(this.dir, name);
  }

  async save(name: string, data: Buffer): Promise<void> {
    await this.ensureDir();
    const target = this.file(name);
    const tmp = `${target}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, target);
  }

  async size(name: string): Promise<number | null> {
    try {
      const s = await stat(this.file(name));
      return s.isFile() ? s.size : null;
    } catch {
      return null;
    }
  }

  read(name: string, range?: ByteRange): Readable {
    return createReadStream(this.file(name), range ? { start: range.start, end: range.end } : {});
  }

  async remove(name: string): Promise<void> {
    await unlink(this.file(name)).catch(() => undefined);
  }
}
