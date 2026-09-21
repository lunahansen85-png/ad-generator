CREATE TABLE IF NOT EXISTS "video_group" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"meta_primary_text" text DEFAULT '' NOT NULL,
	"meta_headline" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "video_asset" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"variant" text NOT NULL,
	"filename" text,
	"key" text NOT NULL,
	"thumb_key" text,
	"content_type" text,
	"bytes" bigint,
	"width" integer,
	"height" integer,
	"duration_s" real,
	"favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "video_asset_group_id_video_group_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."video_group"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "video_asset_key_idx" ON "video_asset" USING btree ("key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "video_asset_group_idx" ON "video_asset" USING btree ("group_id");
