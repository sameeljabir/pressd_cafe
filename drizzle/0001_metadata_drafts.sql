CREATE TABLE "seo_metadata_drafts" (
	"path" text PRIMARY KEY NOT NULL,
	"fields" jsonb NOT NULL,
	"saved_by" text NOT NULL,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL
);
