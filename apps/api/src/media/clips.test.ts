import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import type { Clip } from "@nexquiz/shared";
import { parseBuffer } from "music-metadata";
import { describe, expect, it } from "vitest";
import type { MediaRow } from "../db/schema.js";
import { AppError } from "../errors.js";
import { ClipService, FfmpegClipCutter, type ClipCutter } from "./clips.js";
import type { MediaStorage } from "./storage.js";

const AUDIO_ID = "22222222-2222-4222-8222-222222222222";
const IMAGE_ID = "11111111-1111-4111-8111-111111111111";
const CLIP: Clip = { start: 10, duration: 20 };

function row(id: string, kind: MediaRow["kind"], mime: string): MediaRow {
  return { id, kind, mime, sizeBytes: 4, width: null, height: null, durationS: null, createdAt: new Date(0) };
}

/** Storage + media lookup around in-memory files; the cutter records what it got. */
function setup(cutter?: ClipCutter) {
  const files = new Map<string, Buffer>([[`${AUDIO_ID}.mp3`, Buffer.from("song")]]);
  const rows = new Map([
    [AUDIO_ID, row(AUDIO_ID, "audio", "audio/mpeg")],
    [IMAGE_ID, row(IMAGE_ID, "image", "image/png")],
  ]);
  const storage: MediaStorage = {
    save: async () => undefined,
    size: async (name) => files.get(name)?.length ?? null,
    read: (name) => Readable.from([files.get(name) ?? Buffer.alloc(0)]),
    remove: async () => undefined,
  };
  const media = {
    storage,
    get: async (id: string) => {
      const r = rows.get(id);
      return r ? { row: r, name: `${id}.${r.kind === "audio" ? "mp3" : "png"}` } : null;
    },
  };
  const calls: { input: string; content: string; clip: Clip }[] = [];
  const recording: ClipCutter = {
    cut: async (input, clip) => {
      calls.push({ input, content: (await readFile(input)).toString(), clip });
      return Buffer.from(`clip ${clip.start}+${clip.duration}`);
    },
  };
  return { service: new ClipService(media, cutter ?? recording), calls };
}

describe("ClipService", () => {
  it("cuts the clip from a temp copy of the audio file and removes the copy", async () => {
    const { service, calls } = setup();
    const data = await service.clip(AUDIO_ID, CLIP);
    expect(data.toString()).toBe("clip 10+20");
    expect(calls).toHaveLength(1);
    expect(calls[0]?.content).toBe("song");
    expect(calls[0]?.clip).toEqual(CLIP);
    expect(existsSync(calls[0]?.input ?? "")).toBe(false);
  });

  it("shares one cut between concurrent and later requests of the same clip", async () => {
    const { service, calls } = setup();
    const all = await Promise.all(Array.from({ length: 20 }, () => service.clip(AUDIO_ID, CLIP)));
    await service.clip(AUDIO_ID, CLIP);
    expect(new Set(all.map((b) => b.toString()))).toEqual(new Set(["clip 10+20"]));
    expect(calls).toHaveLength(1);
    // Another clip of the same song is a separate cut.
    await service.clip(AUDIO_ID, { start: 0, duration: 15 });
    expect(calls).toHaveLength(2);
  });

  it("does not cache a failed cut", async () => {
    let fail = true;
    const { service } = setup({
      cut: async () => {
        if (fail) throw new Error("ffmpeg failed");
        return Buffer.from("ok");
      },
    });
    await expect(service.clip(AUDIO_ID, CLIP)).rejects.toThrow("ffmpeg failed");
    fail = false;
    await expect(service.clip(AUDIO_ID, CLIP)).resolves.toEqual(Buffer.from("ok"));
  });

  it("answers NOT_FOUND for an unknown id or media that is not audio", async () => {
    const { service, calls } = setup();
    for (const id of [IMAGE_ID, "77777777-7777-4777-8777-777777777777"]) {
      await expect(service.clip(id, CLIP)).rejects.toSatisfy((e: unknown) => e instanceof AppError && e.code === "NOT_FOUND");
    }
    expect(calls).toHaveLength(0);
  });
});

/** The real cut needs `ffmpeg` (installed in the Docker image); skipped where it is missing. */
const hasFfmpeg = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status === 0;

describe.skipIf(!hasFfmpeg)("FfmpegClipCutter", () => {
  it("cuts only the clip and drops the tags that would reveal the answer", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nexquiz-clip-test-"));
    try {
      const input = path.join(dir, "song.mp3");
      // 30 s tone tagged like a real upload: artist / title are the answer of a music question.
      const made = spawnSync("ffmpeg", [
        "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=30",
        "-metadata", "artist=Metallica", "-metadata", "title=Nothing Else Matters", "-c:a", "libmp3lame", input,
      ]);
      expect(made.status).toBe(0);

      const out = await new FfmpegClipCutter().cut(input, { start: 10, duration: 5 });
      expect(out.toString("latin1")).not.toMatch(/Metallica|Nothing Else Matters|ID3/);
      const meta = await parseBuffer(out, { mimeType: "audio/mpeg", size: out.length }, { duration: true });
      expect(meta.common.artist).toBeUndefined();
      expect(meta.common.title).toBeUndefined();
      expect(meta.format.duration).toBeGreaterThan(4.5);
      expect(meta.format.duration).toBeLessThan(5.5);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects when the input is not audio", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "nexquiz-clip-test-"));
    try {
      const input = path.join(dir, "broken.mp3");
      await writeFile(input, "not audio");
      await expect(new FfmpegClipCutter().cut(input, CLIP)).rejects.toThrow(/ffmpeg exited/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
