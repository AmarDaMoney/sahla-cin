ALTER TABLE "movies" ADD COLUMN "original_title" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "original_language" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "tmdb_id" integer;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_tmdb_id_unique" UNIQUE("tmdb_id");