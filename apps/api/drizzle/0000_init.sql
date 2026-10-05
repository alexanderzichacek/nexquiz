CREATE TABLE "game_answers" (
	"game_id" uuid NOT NULL,
	"question_index" integer NOT NULL,
	"player_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"correctness" numeric(4, 3) NOT NULL,
	"points" numeric(8, 2) NOT NULL,
	"answered_ms" integer NOT NULL,
	CONSTRAINT "game_answers_game_id_question_index_player_id_pk" PRIMARY KEY("game_id","question_index","player_id")
);
--> statement-breakpoint
CREATE TABLE "game_players" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"nickname" text NOT NULL,
	"score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"final_rank" integer
);
--> statement-breakpoint
CREATE TABLE "games" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid,
	"pin" text NOT NULL,
	"status" text NOT NULL,
	"quiz_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	CONSTRAINT "games_status_check" CHECK ("games"."status" in ('lobby','running','finished'))
);
--> statement-breakpoint
CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"mime" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"width" integer,
	"height" integer,
	"duration_s" numeric(8, 2),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('image','audio'))
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quiz_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"type" text NOT NULL,
	"prompt" text NOT NULL,
	"image_id" uuid,
	"audio_id" uuid,
	"time_limit" integer DEFAULT 30 NOT NULL,
	"points" numeric(6, 2) DEFAULT '1' NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "questions_quiz_id_position_key" UNIQUE("quiz_id","position"),
	CONSTRAINT "questions_type_check" CHECK ("questions"."type" in ('single','multi','order','hotspot','text','music')),
	CONSTRAINT "questions_time_limit_check" CHECK ("questions"."time_limit" between 5 and 120)
);
--> statement-breakpoint
CREATE TABLE "quizzes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"settings" jsonb DEFAULT '{"speedBonus":true,"showLeaderboardAfterEach":true,"shuffleOptions":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_player_id_game_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."game_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_audio_id_media_id_fk" FOREIGN KEY ("audio_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;