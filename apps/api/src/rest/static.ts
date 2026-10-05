import { existsSync } from "node:fs";
import path from "node:path";
import fastifyStatic from "@fastify/static";
import type { ErrorResponse } from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";

/** Prefixes that are never answered with the SPA `index.html`. */
const NON_SPA_PREFIXES = ["/api", "/media", "/socket.io"];

/**
 * Serves the built frontend from `publicDir` with SPA fallback: unknown GET
 * routes outside `/api`, `/media` and `/socket.io` return `index.html`.
 * Everything else gets a JSON 404 with a stable error code.
 */
export async function staticRoutes(app: FastifyInstance, publicDir: string): Promise<void> {
  const hasFrontend = existsSync(path.join(publicDir, "index.html"));

  if (hasFrontend) {
    await app.register(fastifyStatic, {
      root: publicDir,
      wildcard: true,
      index: ["index.html"],
      setHeaders(reply, filePath) {
        // Vite emits content-hashed files into /assets → cache forever.
        const rel = path.relative(publicDir, filePath);
        reply.header(
          "Cache-Control",
          rel.startsWith(`assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache",
        );
      },
    });
  } else {
    app.log.warn({ publicDir }, "frontend build not found, static serving disabled");
  }

  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split("?")[0] ?? "/";
    const isSpaRoute =
      hasFrontend &&
      (req.method === "GET" || req.method === "HEAD") &&
      !NON_SPA_PREFIXES.some((p) => url === p || url.startsWith(`${p}/`));
    if (isSpaRoute) {
      return reply.header("Cache-Control", "no-cache").sendFile("index.html");
    }
    const body: ErrorResponse = { error: "NOT_FOUND" };
    return reply.code(404).send(body);
  });
}
