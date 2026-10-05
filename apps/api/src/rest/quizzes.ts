import {
  DEFAULT_QUIZ_TITLE,
  idParamsSchema,
  quizCreateRequestSchema,
  quizDuplicateRequestSchema,
  quizUpdateRequestSchema,
  type QuizDto,
  type QuizListResponse,
} from "@nexquiz/shared";
import type { FastifyInstance } from "fastify";
import type { QuizStore } from "../app.js";
import { AppError } from "../errors.js";
import { requireHost } from "./session.js";
import { parseInput } from "./validation.js";

/** Quiz CRUD + duplicate (host only). */
export async function quizRoutes(app: FastifyInstance, opts: { quizzes: QuizStore }): Promise<void> {
  const { quizzes } = opts;

  await app.register(async (scope) => {
    scope.addHook("onRequest", requireHost);

    scope.get("/api/quizzes", async (): Promise<QuizListResponse> => quizzes.list());

    scope.post("/api/quizzes", async (req, reply) => {
      const body = parseInput(quizCreateRequestSchema, req.body ?? {});
      const quiz: QuizDto = await quizzes.create(body.title ?? DEFAULT_QUIZ_TITLE);
      return reply.code(201).send(quiz);
    });

    scope.get("/api/quizzes/:id", async (req): Promise<QuizDto> => {
      const { id } = parseInput(idParamsSchema, req.params);
      const quiz = await quizzes.get(id);
      if (!quiz) throw new AppError("NOT_FOUND");
      return quiz;
    });

    scope.put("/api/quizzes/:id", { bodyLimit: 2 * 1024 * 1024 }, async (req): Promise<QuizDto> => {
      const { id } = parseInput(idParamsSchema, req.params);
      const body = parseInput(quizUpdateRequestSchema, req.body);
      const quiz = await quizzes.update(id, body);
      if (!quiz) throw new AppError("NOT_FOUND");
      return quiz;
    });

    scope.post("/api/quizzes/:id/duplicate", async (req, reply) => {
      const { id } = parseInput(idParamsSchema, req.params);
      const body = parseInput(quizDuplicateRequestSchema, req.body ?? {});
      const quiz = await quizzes.duplicate(id, body.title);
      if (!quiz) throw new AppError("NOT_FOUND");
      return reply.code(201).send(quiz);
    });

    scope.delete("/api/quizzes/:id", async (req, reply) => {
      const { id } = parseInput(idParamsSchema, req.params);
      if (!(await quizzes.delete(id))) throw new AppError("NOT_FOUND");
      return reply.code(204).send();
    });
  });
}
