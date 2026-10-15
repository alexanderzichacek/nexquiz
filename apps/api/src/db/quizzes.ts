import { randomUUID } from "node:crypto";
import {
  DEFAULT_QUIZ_SETTINGS,
  isPage,
  quizItemSchema,
  quizSettingsSchema,
  type ImageSize,
  type MediaRef,
  type Quiz,
  type QuizItem,
  type QuizDto,
  type QuizSummary,
  type QuizUpdateRequest,
} from "@nexquiz/shared";
import { asc, desc, eq, inArray, sql } from "drizzle-orm";
import { AppError } from "../errors.js";
import type { QuizSource } from "../game/ports.js";
import type { Database } from "./client.js";
import { PG_FOREIGN_KEY_VIOLATION, PG_UNIQUE_VIOLATION, pgErrorCode } from "./errors.js";
import { media, questions, quizzes, type QuestionRow, type QuizRow } from "./schema.js";

type QuestionInsert = typeof questions.$inferInsert;

/** Column values a `page` stores in the `questions` table instead of a time limit and points. */
const PAGE_TIME_LIMIT = 30;
const PAGE_POINTS = "0.00";

function toItem(row: QuestionRow): QuizItem {
  if (row.type === "page") {
    const description = (row.data as { description?: unknown } | null)?.description;
    return quizItemSchema.parse({
      id: row.id,
      type: "page",
      title: row.prompt,
      description: typeof description === "string" ? description : "",
      ...(row.imageId ? { media: { imageId: row.imageId } } : {}),
    });
  }
  const ref: MediaRef = {};
  if (row.imageId) ref.imageId = row.imageId;
  if (row.audioId) ref.audioId = row.audioId;
  if (row.videoId) ref.videoId = row.videoId;
  return quizItemSchema.parse({
    id: row.id,
    type: row.type,
    prompt: row.prompt,
    ...(Object.keys(ref).length > 0 ? { media: ref } : {}),
    timeLimit: row.timeLimit,
    points: Number(row.points),
    data: row.data,
    ...(row.explanation ? { explanation: row.explanation } : {}),
  });
}

function toQuestionRow(quizId: string, q: QuizItem, position: number): QuestionInsert {
  if (isPage(q)) {
    return {
      id: q.id,
      quizId,
      position,
      type: "page",
      prompt: q.title,
      imageId: q.media?.imageId ?? null,
      audioId: null,
      videoId: null,
      timeLimit: PAGE_TIME_LIMIT,
      points: PAGE_POINTS,
      data: { description: q.description },
      explanation: null,
    };
  }
  return {
    id: q.id,
    quizId,
    position,
    type: q.type,
    prompt: q.prompt,
    imageId: q.media?.imageId ?? null,
    audioId: q.media?.audioId ?? null,
    videoId: q.media?.videoId ?? null,
    timeLimit: q.timeLimit,
    points: q.points.toFixed(2),
    data: q.data,
    explanation: q.explanation ?? null,
  };
}

function toDto(row: QuizRow, qs: readonly QuizItem[]): QuizDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    settings: quizSettingsSchema.parse(row.settings),
    questions: [...qs],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Maps constraint violations caused by client data (e.g. a foreign question id) to `INVALID`. */
function rethrowAsInvalid(err: unknown): never {
  const code = pgErrorCode(err);
  if (code === PG_UNIQUE_VIOLATION || code === PG_FOREIGN_KEY_VIOLATION) throw new AppError("INVALID");
  throw err;
}

/** Quizzes and their ordered questions (Postgres). */
export class QuizRepository implements QuizSource {
  constructor(private readonly db: Database) {}

  async list(): Promise<QuizSummary[]> {
    const rows = await this.db
      .select({
        id: quizzes.id,
        title: quizzes.title,
        updatedAt: quizzes.updatedAt,
        // Pages are not questions.
        questionCount: sql<number>`count(${questions.id}) filter (where ${questions.type} <> 'page')`,
      })
      .from(quizzes)
      .leftJoin(questions, eq(questions.quizId, quizzes.id))
      .groupBy(quizzes.id)
      .orderBy(desc(quizzes.updatedAt));
    return rows.map((r) => ({
      id: r.id,
      title: r.title,
      questionCount: Number(r.questionCount),
      updatedAt: r.updatedAt.toISOString(),
    }));
  }

  async get(id: string): Promise<QuizDto | null> {
    const [row] = await this.db.select().from(quizzes).where(eq(quizzes.id, id));
    if (!row) return null;
    const qs = await this.db.select().from(questions).where(eq(questions.quizId, id)).orderBy(asc(questions.position));
    return toDto(row, qs.map(toItem));
  }

  async create(title: string): Promise<QuizDto> {
    const [row] = await this.db
      .insert(quizzes)
      .values({ title, description: null, settings: { ...DEFAULT_QUIZ_SETTINGS } })
      .returning();
    if (!row) throw new Error("quiz insert returned no row");
    return toDto(row, []);
  }

  /** Saves the whole quiz; its questions are replaced inside one transaction. */
  async update(id: string, input: QuizUpdateRequest): Promise<QuizDto | null> {
    await this.assertMediaRefs(input.questions);
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .update(quizzes)
          .set({
            title: input.title,
            description: input.description,
            settings: input.settings,
            updatedAt: new Date(),
          })
          .where(eq(quizzes.id, id))
          .returning();
        if (!row) return null;
        await tx.delete(questions).where(eq(questions.quizId, id));
        if (input.questions.length > 0) {
          await tx.insert(questions).values(input.questions.map((q, i) => toQuestionRow(id, q, i)));
        }
        return toDto(row, input.questions);
      });
    } catch (err) {
      rethrowAsInvalid(err);
    }
  }

  /** Copies a quiz with new question ids. */
  async duplicate(id: string, title?: string): Promise<QuizDto | null> {
    const original = await this.get(id);
    if (!original) return null;
    const copies = original.questions.map((q) => ({ ...q, id: randomUUID() }));
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(quizzes)
        .values({ title: title ?? original.title, description: original.description, settings: original.settings })
        .returning();
      if (!row) throw new Error("quiz insert returned no row");
      if (copies.length > 0) await tx.insert(questions).values(copies.map((q, i) => toQuestionRow(row.id, q, i)));
      return toDto(row, copies);
    });
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db.delete(quizzes).where(eq(quizzes.id, id)).returning({ id: quizzes.id });
    return rows.length > 0;
  }

  /** Quiz incl. correct answers + hotspot image sizes, for a game snapshot. */
  async loadForSnapshot(quizId: string): Promise<{ quiz: Quiz; images: Record<string, ImageSize> } | null> {
    const dto = await this.get(quizId);
    if (!dto) return null;
    const imageIds = [...new Set(dto.questions.flatMap((q) => (q.media?.imageId ? [q.media.imageId] : [])))];
    const images: Record<string, ImageSize> = {};
    if (imageIds.length > 0) {
      const rows = await this.db
        .select({ id: media.id, width: media.width, height: media.height })
        .from(media)
        .where(inArray(media.id, imageIds));
      for (const r of rows) {
        if (r.width && r.height) images[r.id] = { width: r.width, height: r.height };
      }
    }
    return {
      quiz: {
        id: dto.id,
        title: dto.title,
        description: dto.description,
        settings: dto.settings,
        questions: dto.questions,
      },
      images,
    };
  }

  /** Every `imageId` / `audioId` / `videoId` (of a question and of its explanation) must be an uploaded file of that kind. */
  private async assertMediaRefs(qs: readonly QuizItem[]): Promise<void> {
    const wanted = new Map<string, "image" | "audio" | "video">();
    const want = (id: string | undefined, kind: "image" | "audio" | "video"): void => {
      if (!id) return;
      // The same media id used as two different kinds can never be valid.
      if (wanted.get(id) !== undefined && wanted.get(id) !== kind) throw new AppError("INVALID");
      wanted.set(id, kind);
    };
    for (const q of qs) {
      want(q.media?.imageId, "image");
      if (!isPage(q)) {
        want(q.media?.audioId, "audio");
        want(q.media?.videoId, "video");
        want(q.explanation?.media?.imageId, "image");
        want(q.explanation?.media?.audioId, "audio");
        want(q.explanation?.media?.videoId, "video");
      }
    }
    if (wanted.size === 0) return;
    const rows = await this.db
      .select({ id: media.id, kind: media.kind })
      .from(media)
      .where(inArray(media.id, [...wanted.keys()]));
    const found = new Map(rows.map((r) => [r.id, r.kind]));
    for (const [id, kind] of wanted) {
      if (found.get(id) !== kind) throw new AppError("INVALID");
    }
  }
}
