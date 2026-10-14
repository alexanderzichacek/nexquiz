ALTER TABLE "media" DROP CONSTRAINT "media_kind_check";--> statement-breakpoint
ALTER TABLE "questions" ADD COLUMN "video_id" uuid;--> statement-breakpoint
ALTER TABLE "questions" ADD CONSTRAINT "questions_video_id_media_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."media"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_kind_check" CHECK ("media"."kind" in ('image','audio','video'));