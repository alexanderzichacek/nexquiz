import { describe, expect, it } from "vitest";
import type { MediaRepository } from "../db/media.js";
import type { MediaRow } from "../db/schema.js";
import { extensionOf, MediaService, mediaKindOf } from "./service.js";
import type { MediaStorage } from "./storage.js";

const MB = 1024 * 1024;

/** One ISO BMFF box: size, type, payload. */
function box(type: string, payload: Buffer = Buffer.alloc(0)): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + payload.length, 0);
  head.write(type, 4, "latin1");
  return Buffer.concat([head, payload]);
}

/** Real 64×64, 2 s, silent clips made with ffmpeg (H.264 and VP8). */
const MP4_BASE64 =
  "AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAANKbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAB9AAAQAAAQAAAAAAAAAAAA" +
  "AAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAnR0cmFrAAAAXHRraGQA" +
  "AAADAAAAAAAAAAAAAAABAAAAAAAAB9AAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAEAAAABAAA" +
  "AAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAfQAAAAAAABAAAAAAHsbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAUABVxAAAAAAALWhk" +
  "bHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAABl21pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZW" +
  "YAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAVdzdGJsAAAAt3N0c2QAAAAAAAAAAQAAAKdhdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAAEAAQABI" +
  "AAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAALWF2Y0MBQsAK/+EAFmdCwAraEJsBEAAAAwAQAAADAK" +
  "DxImoBAARozg/IAAAAEHBhc3AAAAABAAAAAQAAABRidHJ0AAAAAAAACwwAAAAAAAAAGHN0dHMAAAAAAAAAAQAAAAoAAAgAAAAAFHN0c3MAAAAA" +
  "AAAAAQAAAAEAAAAcc3RzYwAAAAAAAAABAAAAAQAAAAoAAAABAAAAPHN0c3oAAAAAAAAAAAAAAAoAAAJpAAAACgAAAAoAAAAKAAAACgAAAAoAAA" +
  "AKAAAACgAAAAoAAAAKAAAAFHN0Y28AAAAAAAAAAQAAA3oAAABidWR0YQAAAFptZXRhAAAAAAAAACFoZGxyAAAAAAAAAABtZGlyYXBwbAAAAAAA" +
  "AAAAAAAAAC1pbHN0AAAAJal0b28AAAAdZGF0YQAAAAEAAAAATGF2ZjYyLjEyLjEwMgAAAAhmcmVlAAACy21kYXQAAAJLBgX//0fcRem95tlIt5" +
  "Ys2CDZI+7veDI2NCAtIGNvcmUgMTY0IHIzMTA4IC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyMyAtIGh0dHA6" +
  "Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTAgcmVmPTEgZGVibG9jaz0wOjA6MCBhbmFseXNlPTA6MCBtZT" +
  "1kaWEgc3VibWU9MCBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0wIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MCA4" +
  "eDhkY3Q9MCBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0wIHRocmVhZHM9MiBsb29rYWhlYWRfdG" +
  "hyZWFkcz0xIHNsaWNlZF90aHJlYWRzPTAgbnI9MCBkZWNpbWF0ZT0xIGludGVybGFjZWQ9MCBibHVyYXlfY29tcGF0PTAgY29uc3RyYWluZWRf" +
  "aW50cmE9MCBiZnJhbWVzPTAgd2VpZ2h0cD0wIGtleWludD0yNTAga2V5aW50X21pbj01IHNjZW5lY3V0PTAgaW50cmFfcmVmcmVzaD0wIHJjPW" +
  "NyZiBtYnRyZWU9MCBjcmY9MjMuMCBxY29tcD0wLjYwIHFwbWluPTAgcXBtYXg9NjkgcXBzdGVwPTQgaXBfcmF0aW89MS40MCBhcT0wAIAAAAAW" +
  "ZYiEOiYoAAkCycnJ1111111111114AAAAAZBmiAUoIwAAAAGQZpAFKCMAAAABkGaYBSgjAAAAAZBmoAVoIwAAAAGQZqgFaCMAAAABkGawBWgjA" +
  "AAAAZBmuAVoIwAAAAGQZsAFaCMAAAABkGbIBWgjA==";
const WEBM_BASE64 =
  "GkXfo59ChoEBQveBAULygQRC84EIQoKEd2VibUKHgQJChYECGFOAZwEAAAAAAALJEU2bdLpNu4tTq4QVSalmU6yBoU27i1OrhBZUrmtTrIHYTb" +
  "uMU6uEElTDZ1OsggElTbuMU6uEHFO7a1OsggKz7AEAAAAAAABZAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" +
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAVSalmsirXsYMPQkBNgI1MYXZmNjIuMTIuMTAyV0GNTGF2ZjYyLj" +
  "EyLjEwMkSJiECfQAAAAAAAFlSua8iuAQAAAAAAAD/XgQFzxYj0/5xVxyoUC5yBACK1nIN1bmSIgQCGhVZfVlA4g4EBI+ODhAvrwgDgkLCBQLqB" +
  "QJqBAlWwhFW5gQESVMNn/HNzoGPAgGfImkWjh0VOQ09ERVJEh41MYXZmNjIuMTIuMTAyc3PWY8CLY8WI9P+cVccqFAtnyKFFo4dFTkNPREVSRI" +
  "eUTGF2YzYyLjI4LjEwMiBsaWJ2cHhnyKFFo4hEVVJBVElPTkSHkzAwOjAwOjAyLjAwMDAwMDAwMAAfQ7Z1QQfngQCjqoEAAIDwAgCdASpAAEAA" +
  "AEcIhYWIhYSIAgIABnA8QmAKsiD3MAD+/6tQgKOWgQDIANEBAAEQEAAYABhYL/QACI6AAKOWgQGQANEBAAEQEAAYABhYL/QACI6AAKOWgQJYAN" +
  "EBAAEQEAAYABhYL/QACI6AAKOWgQMgANEBAAEQEAAYABhYL/QACI6AAKOWgQPoANEBAAEQEAAYABhYL/QACI6AAKOWgQSwANEBAAEQEAAYABhY" +
  "L/QACI6AAKOWgQV4ANEBAAEQEBRgAGFgv9AAIjoAAKOWgQZAANEBAAEQEAAYABhYL/QACI6AAKOWgQcIANEBAAEQEAAYABhYL/QACI6AABxTu2" +
  "uRu4+zgQC3iveBAfGCAabwgQM=";
const MP4 = Buffer.from(MP4_BASE64, "base64");
const WEBM = Buffer.from(WEBM_BASE64, "base64");

function setup(videoMb = 1) {
  const files = new Map<string, Buffer>();
  const rows: MediaRow[] = [];
  const storage: MediaStorage = {
    save: async (name, data) => void files.set(name, data),
    size: async (name) => files.get(name)?.length ?? null,
    read: () => {
      throw new Error("not used");
    },
    remove: async (name) => void files.delete(name),
  };
  const repo = {
    insert: async (row: Omit<MediaRow, "createdAt" | "width" | "height" | "durationS"> & Partial<MediaRow>) => {
      rows.push({ width: null, height: null, durationS: null, createdAt: new Date(), ...row });
    },
    get: async (id: string) => rows.find((r) => r.id === id) ?? null,
  } as unknown as MediaRepository;
  const service = new MediaService(storage, repo, {
    imageBytes: 5 * MB,
    audioBytes: 15 * MB,
    videoBytes: videoMb * MB,
  });
  return { service, files, rows };
}

describe("media kinds", () => {
  it("recognizes video MIME types", () => {
    expect(mediaKindOf("video/mp4")).toBe("video");
    expect(mediaKindOf("video/webm")).toBe("video");
    expect(mediaKindOf("video/quicktime")).toBeNull();
    expect(extensionOf("video/mp4")).toBe("mp4");
    expect(extensionOf("video/webm")).toBe("webm");
  });
});

describe("MediaService – video upload", () => {
  it.each([
    // The parser cannot tell the duration of an MP4 without an audio track.
    ["video/mp4", "mp4", MP4, undefined],
    ["video/webm", "webm", WEBM, 2],
  ] as const)("stores %s untouched", async (mime, ext, data, duration) => {
    const { service, files, rows } = setup();
    const res = await service.upload(mime, data);
    expect(res).toMatchObject({ kind: "video", mime });
    expect(res.duration).toBe(duration);
    expect(res.url).toBe(`/media/${res.id}`);
    expect(files.get(`${res.id}.${ext}`)).toEqual(data);
    expect(rows).toMatchObject([{ id: res.id, kind: "video", mime, sizeBytes: data.length }]);
    expect((await service.get(res.id))?.name).toBe(`${res.id}.${ext}`);
  });

  it("rejects an MP4 without a video track", async () => {
    const { service, files } = setup();
    const mvhd = Buffer.alloc(100);
    mvhd.writeUInt32BE(1000, 12);
    const ftyp = box("ftyp", Buffer.concat([Buffer.from("isom"), Buffer.alloc(4), Buffer.from("isom")]));
    const noVideo = Buffer.concat([ftyp, box("moov", box("mvhd", mvhd))]);
    await expect(service.upload("video/mp4", noVideo)).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(files.size).toBe(0);
  });

  it("rejects a file whose content is not the declared container", async () => {
    const { service, files } = setup();
    await expect(service.upload("video/mp4", Buffer.from("definitely not a video, just text"))).rejects.toMatchObject({
      code: "UNSUPPORTED_MEDIA_TYPE",
    });
    // Each container declared as the other one.
    await expect(service.upload("video/webm", MP4)).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    await expect(service.upload("video/mp4", WEBM)).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(files.size).toBe(0);
  });

  it("rejects a corrupted video", async () => {
    const { service, files } = setup();
    // Valid signature, but the rest is garbage.
    const broken = Buffer.concat([MP4.subarray(0, 12), Buffer.alloc(64, 0xff)]);
    await expect(service.upload("video/mp4", broken)).rejects.toMatchObject({ code: "UNSUPPORTED_MEDIA_TYPE" });
    expect(files.size).toBe(0);
  });

  it("rejects a video above the limit", async () => {
    const { service, files } = setup(1);
    const big = Buffer.concat([MP4, Buffer.alloc(MB)]);
    await expect(service.upload("video/mp4", big)).rejects.toMatchObject({ code: "PAYLOAD_TOO_LARGE" });
    expect(files.size).toBe(0);
  });
});
