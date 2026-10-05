import { idParamsSchema } from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";
import { AppError } from "../errors.js";
import type { ByteRange } from "../media/storage.js";
import type { MediaFiles } from "../app.js";
import { mediaKindOf } from "../media/service.js";
import { requireHost } from "./session.js";

const IMMUTABLE = "public, max-age=31536000, immutable";

/** Parses a single `bytes=start-end` range; null = whole file, "invalid" = 416. */
function parseRange(header: string | undefined, size: number): ByteRange | null | "invalid" {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart = "", rawEnd = ""] = match;
  if (rawStart === "" && rawEnd === "") return "invalid";
  let start: number;
  let end: number;
  if (rawStart === "") {
    // suffix range: last N bytes
    const suffix = Number(rawEnd);
    if (suffix === 0) return "invalid";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Math.min(Number(rawEnd), size - 1);
  }
  if (start > end || start >= size) return "invalid";
  return { start, end };
}

/** POST /api/media (host, multipart) and GET /media/:id (public). */
export async function mediaRoutes(app: FastifyInstance, opts: { media: MediaFiles }): Promise<void> {
  const { media } = opts;

  app.post("/api/media", { onRequest: requireHost }, async (req, reply) => {
    if (!req.isMultipart()) throw new AppError("UNSUPPORTED_MEDIA_TYPE");
    const file = await req.file();
    if (!file) throw new AppError("INVALID");
    if (!mediaKindOf(file.mimetype)) {
      file.file.resume();
      throw new AppError("UNSUPPORTED_MEDIA_TYPE");
    }
    // Throws a 413 when the multipart limit (largest of the two kinds) is exceeded.
    const data = await file.toBuffer();
    const result = await media.upload(file.mimetype, data);
    req.log.info({ mediaId: result.id, kind: result.kind, bytes: data.length }, "media uploaded");
    return reply.code(201).send(result);
  });

  app.get("/media/:id", async (req, reply) => {
    const params = idParamsSchema.safeParse(req.params);
    if (!params.success) throw new AppError("NOT_FOUND");
    const found = await media.get(params.data.id);
    if (!found) throw new AppError("NOT_FOUND");
    const size = await media.storage.size(found.name);
    if (size === null) throw new AppError("NOT_FOUND");

    reply.header("Content-Type", found.row.mime);
    reply.header("Cache-Control", IMMUTABLE);
    reply.header("Accept-Ranges", "bytes");

    const range = parseRange(req.headers.range, size);
    if (range === "invalid") {
      return reply.code(416).header("Content-Range", `bytes */${size}`).send();
    }
    if (range) {
      reply.code(206);
      reply.header("Content-Range", `bytes ${range.start}-${range.end}/${size}`);
      reply.header("Content-Length", String(range.end - range.start + 1));
      return reply.send(media.storage.read(found.name, range));
    }
    reply.header("Content-Length", String(size));
    return reply.send(media.storage.read(found.name));
  });
}
