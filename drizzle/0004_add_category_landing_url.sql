CREATE TABLE IF NOT EXISTS "category_settings" (
	"category" text PRIMARY KEY NOT NULL,
	"landing_url" text DEFAULT '' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
-- De kendte landingssider (24.09.2026, alle tre tjekket live til status 200).
-- ON CONFLICT DO NOTHING: koeres migrationen igen, overskrives en rettelse fra UI'et ikke.
INSERT INTO "category_settings" ("category", "landing_url") VALUES
	('morten', 'https://kjeldgaards.com/morten/'),
	('retinol', 'https://kjeldgaards.com/indkapslet/'),
	('testimonial', 'https://kjeldgaards.com/listicle01/')
ON CONFLICT ("category") DO NOTHING;
