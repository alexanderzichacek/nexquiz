import { randomUUID } from "node:crypto";
import {
  AUDIO_MIME_TYPES,
  IMAGE_MAX_DIMENSION,
  IMAGE_MIME_TYPES,
  type MediaKind,
  type MediaUploadResponse,
  VIDEO_MIME_TYPES,
} from "@nexquiz/shared";
import { parseBuffer } from "music-metadata";
import sharp from "sharp";
import type { MediaRepository } from "../db/media.js";
import type { MediaRow } from "../db/schema.js";
import { AppError } from "../errors.js";
import type { MediaStorage } from "./storage.js";

type ImageMime = keyof typeof IMAGE_MIME_TYPES;
type AudioMime = keyof typeof AUDIO_MIME_TYPES;
type VideoMime = keyof typeof VIDEO_MIME_TYPES;

/** sharp output format → stored MIME type. */
const IMAGE_FORMATS = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" } as const;
type ImageFormat = keyof typeof IMAGE_FORMATS;

function isImageMime(mime: string): mime is ImageMime {
  return Object.hasOwn(IMAGE_MIME_TYPES, mime);
}

function isAudioMime(mime: string): mime is AudioMime {
  return Object.hasOwn(AUDIO_MIME_TYPES, mime);
}

function isVideoMime(mime: string): mime is VideoMime {
  return Object.hasOwn(VIDEO_MIME_TYPES, mime);
}

function isImageFormat(format: string | undefined): format is ImageFormat {
  return format !== undefined && Object.hasOwn(IMAGE_FORMATS, format);
}

/** MP4 has an `ftyp` box at offset 4, WebM (EBML) starts with `1A 45 DF A3`. */
function hasVideoSignature(mime: VideoMime, data: Buffer): boolean {
  if (mime === "video/mp4") return data.length > 12 && data.toString("latin1", 4, 8) === "ftyp";
  return data.length > 4 && data.readUInt32BE(0) === 0x1a45dfa3;
}

/** Media kind of an allowed upload MIME type, or null. */
export function mediaKindOf(mime: string): MediaKind | null {
  if (isImageMime(mime)) return "image";
  if (isAudioMime(mime)) return "audio";
  if (isVideoMime(mime)) return "video";
  return null;
}

/** File extension for a stored MIME type. */
export function extensionOf(mime: string): string | null {
  if (isImageMime(mime)) return IMAGE_MIME_TYPES[mime];
  if (isAudioMime(mime)) return AUDIO_MIME_TYPES[mime];
  if (isVideoMime(mime)) return VIDEO_MIME_TYPES[mime];
  return null;
}

export function mediaUrl(id: string): string {
  return `/media/${id}`;
}

export interface MediaLimits {
  imageBytes: number;
  audioBytes: number;
  videoBytes: number;
}

/** Upload processing: validation, image resize (sharp), audio / video duration (music-metadata). */
export class MediaService {
  constructor(
    readonly storage: MediaStorage,
    private readonly repo: MediaRepository,
    readonly limits: MediaLimits,
  ) {}

  async upload(mime: string, data: Buffer): Promise<MediaUploadResponse> {
    if (isImageMime(mime)) {
      if (data.length > this.limits.imageBytes) throw new AppError("PAYLOAD_TOO_LARGE");
      return this.uploadImage(data);
    }
    if (isAudioMime(mime)) {
      if (data.length > this.limits.audioBytes) throw new AppError("PAYLOAD_TOO_LARGE");
      return this.uploadAudio(mime, data);
    }
    if (isVideoMime(mime)) {
      if (data.length > this.limits.videoBytes) throw new AppError("PAYLOAD_TOO_LARGE");
      return this.uploadVideo(mime, data);
    }
    throw new AppError("UNSUPPORTED_MEDIA_TYPE");
  }

  async get(id: string): Promise<{ row: MediaRow; name: string } | null> {
    const row = await this.repo.get(id);
    const ext = row ? extensionOf(row.mime) : null;
    return row && ext ? { row, name: `${row.id}.${ext}` } : null;
  }

  private async uploadImage(data: Buffer): Promise<MediaUploadResponse> {
    // The real format comes from the file content, not from the declared MIME type.
    const meta = await sharp(data)
      .metadata()
      .catch(() => null);
    if (!meta || !isImageFormat(meta.format)) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
    const format = meta.format;

    const { data: out, info } = await sharp(data)
      .rotate()
      .resize({
        width: IMAGE_MAX_DIMENSION,
        height: IMAGE_MAX_DIMENSION,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toFormat(format)
      .toBuffer({ resolveWithObject: true })
      .catch(() => {
        throw new AppError("UNSUPPORTED_MEDIA_TYPE");
      });

    const mime = IMAGE_FORMATS[format];
    const id = randomUUID();
    const name = `${id}.${IMAGE_MIME_TYPES[mime]}`;
    await this.storage.save(name, out);
    try {
      await this.repo.insert({
        id,
        kind: "image",
        mime,
        sizeBytes: out.length,
        width: info.width,
        height: info.height,
      });
    } catch (err) {
      await this.storage.remove(name);
      throw err;
    }
    return { id, url: mediaUrl(id), kind: "image", mime, width: info.width, height: info.height };
  }

  private async uploadAudio(declared: AudioMime, data: Buffer): Promise<MediaUploadResponse> {
    const metadata = await parseBuffer(data, { mimeType: declared, size: data.length }, { duration: true }).catch(
      () => null,
    );
    if (!metadata?.format.container) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
    const rawDuration = metadata.format.duration;
    const duration =
      rawDuration !== undefined && Number.isFinite(rawDuration) ? Math.round(rawDuration * 100) / 100 : undefined;

    // All m4a variants are stored as audio/mp4.
    const ext = AUDIO_MIME_TYPES[declared];
    const mime = ext === "m4a" ? "audio/mp4" : declared;
    const id = randomUUID();
    const name = `${id}.${ext}`;
    await this.storage.save(name, data);
    try {
      await this.repo.insert({
        id,
        kind: "audio",
        mime,
        sizeBytes: data.length,
        durationS: duration === undefined ? null : duration.toFixed(2),
      });
    } catch (err) {
      await this.storage.remove(name);
      throw err;
    }
    return duration === undefined
      ? { id, url: mediaUrl(id), kind: "audio", mime }
      : { id, url: mediaUrl(id), kind: "audio", mime, duration };
  }

  /**
   * Videos are stored untouched (no transcoding). The container is checked by
   * its magic bytes and parsed with `music-metadata`, which must find a video
   * track. The duration is best effort: it is missing for MP4 files without
   * an audio track.
   */
  private async uploadVideo(declared: VideoMime, data: Buffer): Promise<MediaUploadResponse> {
    if (!hasVideoSignature(declared, data)) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
    const metadata = await parseBuffer(data, { mimeType: declared, size: data.length }, { duration: true }).catch(
      () => null,
    );
    if (!metadata || metadata.format.hasVideo === false) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
    const rawDuration = metadata.format.duration;
    const duration =
      rawDuration !== undefined && Number.isFinite(rawDuration) ? Math.round(rawDuration * 100) / 100 : undefined;
    const id = randomUUID();
    const name = `${id}.${VIDEO_MIME_TYPES[declared]}`;
    await this.storage.save(name, data);
    try {
      await this.repo.insert({
        id,
        kind: "video",
        mime: declared,
        sizeBytes: data.length,
        durationS: duration === undefined ? null : duration.toFixed(2),
      });
    } catch (err) {
      await this.storage.remove(name);
      throw err;
    }
    return duration === undefined
      ? { id, url: mediaUrl(id), kind: "video", mime: declared }
      : { id, url: mediaUrl(id), kind: "video", mime: declared, duration };
  }
}
