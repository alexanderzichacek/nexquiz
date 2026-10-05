import type { HealthResponse } from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";

export interface HealthDeps {
  pingDb(): Promise<boolean>;
  pingRedis(): Promise<boolean>;
}

/** GET /api/health – liveness plus DB / Redis connectivity. */
export async function healthRoutes(app: FastifyInstance, deps: HealthDeps): Promise<void> {
  app.get("/api/health", async (_req, reply) => {
    const [db, redis] = await Promise.all([deps.pingDb(), deps.pingRedis()]);
    const body: HealthResponse = { status: db && redis ? "ok" : "degraded", db, redis };
    return reply.code(body.status === "ok" ? 200 : 503).send(body);
  });
}
