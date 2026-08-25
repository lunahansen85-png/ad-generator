CREATE TABLE "ad_copy" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"headline" text DEFAULT '' NOT NULL,
	"quote" text DEFAULT '' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"source" text DEFAULT 'other' NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"subheadline" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generated_image" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ad_copy_id" text NOT NULL,
	"template_id" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"filename" text NOT NULL,
	"key" text NOT NULL,
	"bytes" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_image" ADD CONSTRAINT "generated_image_ad_copy_id_ad_copy_id_fk" FOREIGN KEY ("ad_copy_id") REFERENCES "public"."ad_copy"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ad_copy_category_idx" ON "ad_copy" USING btree ("category","archived");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_image_key_idx" ON "generated_image" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "generated_image_copy_template_idx" ON "generated_image" USING btree ("ad_copy_id","template_id");--> statement-breakpoint
CREATE INDEX "generated_image_copy_idx" ON "generated_image" USING btree ("ad_copy_id");