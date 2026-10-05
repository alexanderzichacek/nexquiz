-- Custom migration: Drizzle cannot declare deferrable constraints.
-- LOGIC.md: unique (quiz_id, position) deferrable initially deferred,
-- so questions can be reordered inside one transaction.
ALTER TABLE "questions" DROP CONSTRAINT "questions_quiz_id_position_key";--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_position_key" UNIQUE ("quiz_id", "position") DEFERRABLE INITIALLY DEFERRED;
