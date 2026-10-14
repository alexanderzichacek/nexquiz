ALTER TABLE "game_players" ALTER COLUMN "score" SET DATA TYPE numeric(10, 2);--> statement-breakpoint
ALTER TABLE "game_players" ALTER COLUMN "score" SET DEFAULT '0';--> statement-breakpoint
ALTER TABLE "questions" ALTER COLUMN "points" SET DEFAULT '1000';