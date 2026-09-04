ALTER TABLE "ad_copy" ADD COLUMN IF NOT EXISTS "meta_primary_text" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "ad_copy" ADD COLUMN IF NOT EXISTS "meta_headline" text DEFAULT '' NOT NULL;
