CREATE TABLE "media" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" text NOT NULL,
	"data" "bytea" NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"uploaded_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_content_type_check" CHECK ("media"."content_type" IN ('image/jpeg', 'image/png', 'image/webp')),
	CONSTRAINT "media_size_check" CHECK ("media"."size" BETWEEN 1 AND 3000000)
);
--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "name_ar" text;--> statement-breakpoint
ALTER TABLE "cities" ADD COLUMN "name_en" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "title_en" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "synopsis_ar" text;--> statement-breakpoint
ALTER TABLE "movies" ADD COLUMN "synopsis_en" text;--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_user_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;