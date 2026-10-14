import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Clip } from "@nexquiz/shared";
import { AppError } from "../errors.js";
import type { MediaService } from "./service.js";

/** MIME type of every cut clip. */
export const CLIP_MIME = "audio/mpeg";

/** Cuts `clip` out of the audio file at `input` into a tag-free MP3. */
export interface ClipCutter {
  cut(input: string, clip: Clip): Promise<Buffer>;
}

/** A clip is ≤ 120 s, so cutting takes well under a second; this only guards a stuck process. */
const FFMPEG_TIMEOUT_MS = 30_000;

/**
 * `ffmpeg` from the PATH (installed in the Docker image). Re-encodes only
 * the clip to MP3 (every browser decodes it) and drops all metadata, so
 * neither the tags (artist / title = the answer of a music question) nor the
 * rest of the song (the lyrics to fill in) reach the player.
 */
export class FfmpegClipCutter implements ClipCutter {
  constructor(private readonly bin = "ffmpeg") {}

  cut(input: string, clip: Clip): Promise<Buffer> {
    const args = [
      "-hide_banner", "-loglevel", "error", "-nostdin",
      "-ss", String(clip.start), "-t", String(clip.duration), "-i", input,
      "-map", "0:a:0", "-vn", "-sn", "-dn",
      "-map_metadata", "-1", "-map_chapters", "-1", "-fflags", "+bitexact",
      "-c:a", "libmp3lame", "-b:a", "128k", "-id3v2_version", "0",
      "-f", "mp3", "pipe:1",
    ];
    return new Promise((resolve, reject) => {
      const proc = spawn(this.bin, args, { stdio: ["ignore", "pipe", "pipe"] });
      const out: Buffer[] = [];
      let stderr = "";
      const timer = setTimeout(() => proc.kill("SIGKILL"), FFMPEG_TIMEOUT_MS);
      proc.stdout.on("data", (chunk: Buffer) => out.push(chunk));
      proc.stderr.on("data", (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-500);
      });
      proc.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      proc.on("close", (code) => {
        clearTimeout(timer);
        const data = Buffer.concat(out);
        if (code === 0 && data.length > 0) resolve(data);
        else reject(new Error(`ffmpeg exited with ${String(code)}: ${stderr.trim()}`));
      });
    });
  }
}

/** Cached clips (≤ 120 s × 128 kbit/s ≈ 2 MB each). */
const CACHE_MAX = 16;

/**
 * Audio clips for players who play sound on their own device. The cut is
 * cached per (audio, start, duration) and concurrent requests of all players
 * at the start of a question share one ffmpeg run.
 */
export class ClipService {
  private readonly cache = new Map<string, Promise<Buffer>>();

  constructor(
    private readonly media: Pick<MediaService, "get" | "storage">,
    private readonly cutter: ClipCutter,
  ) {}

  clip(audioId: string, clip: Clip): Promise<Buffer> {
    const key = `${audioId}:${clip.start}:${clip.duration}`;
    const cached = this.cache.get(key);
    if (cached) {
      // Re-insert = most recently used.
      this.cache.delete(key);
      this.cache.set(key, cached);
      return cached;
    }
    const pending = this.cut(audioId, clip);
    // A failed cut is not cached, the next request tries again.
    pending.catch(() => this.cache.delete(key));
    this.cache.set(key, pending);
    for (const old of this.cache.keys()) {
      if (this.cache.size <= CACHE_MAX) break;
      this.cache.delete(old);
    }
    return pending;
  }

  /** ffmpeg needs a seekable file (an M4A may have its index at the end), so the source is copied to a temp file. */
  private async cut(audioId: string, clip: Clip): Promise<Buffer> {
    const found = await this.media.get(audioId);
    if (!found || found.row.kind !== "audio") throw new AppError("NOT_FOUND");
    const dir = await mkdtemp(path.join(tmpdir(), "nexquiz-clip-"));
    try {
      const input = path.join(dir, found.name);
      await pipeline(this.media.storage.read(found.name), createWriteStream(input));
      return await this.cutter.cut(input, clip);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
