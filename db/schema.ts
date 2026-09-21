import {
  pgTable,
  text,
  boolean,
  integer,
  bigint,
  real,
  uuid,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql, relations } from "drizzle-orm";

/**
 * ad_copy = den faelles "CSV". Én raekke pr. annoncetekst.
 * Baade Thomas og Luna redigerer de samme raekker via web-UI'et.
 */
export const adCopy = pgTable(
  "ad_copy",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    category: text("category").notNull(), // morten | testimonial | retinol

    // testimonial
    headline: text("headline").notNull().default(""),
    quote: text("quote").notNull().default(""),
    name: text("name").notNull().default(""),
    source: text("source").notNull().default("other"), // trustpilot | other

    // morten
    text: text("text").notNull().default(""),

    // retinol
    subheadline: text("subheadline").notNull().default(""),
    body: text("body").notNull().default(""),

    // Meta-annoncetekst (05.09.2026). Hoerer til ANNONCEN, ikke til billedet: de brændes aldrig
    // ind i grafikken (lib/generate.ts og lib/templates/* rører dem ikke). Ad Studio henter dem
    // med hvert billede via /api/copy og udfylder trin ②'s primaertekst/overskrift pr. annonce.
    // Alle raekkens billeder deler dem — én tekstraekke = ét budskab = én annoncetekst.
    metaPrimaryText: text("meta_primary_text").notNull().default(""),
    metaHeadline: text("meta_headline").notNull().default(""),

    note: text("note").notNull().default(""),
    archived: boolean("archived").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ad_copy_category_idx").on(t.category, t.archived)]
);

/**
 * generated_image = ét renderet billede, gemt i bucket.
 * `key` er noeglen i bucket og indgaar i den faste offentlige URL: /i/<key>
 */
export const generatedImage = pgTable(
  "generated_image",
  {
    id: text("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    adCopyId: text("ad_copy_id")
      .notNull()
      .references(() => adCopy.id, { onDelete: "cascade" }),
    templateId: text("template_id").notNull(),
    label: text("label").notNull().default(""),
    filename: text("filename").notNull(),
    key: text("key").notNull(),
    bytes: integer("bytes").notNull().default(0),
    favorite: boolean("favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("generated_image_key_idx").on(t.key),
    uniqueIndex("generated_image_copy_template_idx").on(t.adCopyId, t.templateId),
    index("generated_image_copy_idx").on(t.adCopyId),
  ]
);

export type AdCopyRow = typeof adCopy.$inferSelect;
export type GeneratedImageRow = typeof generatedImage.$inferSelect;

// Relationer — kraeves af Drizzles query-API (db.query...with).
export const adCopyRelations = relations(adCopy, ({ many }) => ({
  images: many(generatedImage),
}));

export const generatedImageRelations = relations(generatedImage, ({ one }) => ({
  adCopy: one(adCopy, {
    fields: [generatedImage.adCopyId],
    references: [adCopy.id],
  }),
}));

/**
 * video_group = én færdig videoannonce i biblioteket (fx "VID 76"). Ingen redigering af selve
 * videoen her — kun opbevaring + Meta-annoncetekst. Varianterne (hooks, længder) er video_asset.
 * id'et laves af serveren FØR upload, fordi det indgår i bucket-nøglen (vid/<gruppe>/<variant>.mp4).
 */
export const videoGroup = pgTable("video_group", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Bibliotekets kategori-id (morten | testimonial | retinol) eller en ny, brugerskabt slug.
  category: text("category").notNull(),
  name: text("name").notNull(),
  // Samme betydning som ad_copy.meta_*: teksten i SELVE annoncen, fælles for alle varianter.
  metaPrimaryText: text("meta_primary_text").notNull().default(""),
  metaHeadline: text("meta_headline").notNull().default(""),
  note: text("note").notNull().default(""),
  archived: boolean("archived").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * video_asset = én videofil (variant) i en video_group. `key` er noeglen i bucket og indgaar i
 * den faste offentlige URL /v/<key>, som Meta henter videoen fra. `thumbKey` er et JPEG-stillbillede
 * (lavet i browseren ved upload), serveret af den eksisterende /i/-rute — Meta kraever et
 * thumbnail til videoannoncer.
 */
export const videoAsset = pgTable(
  "video_asset",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => videoGroup.id, { onDelete: "cascade" }),
    variant: text("variant").notNull(),
    filename: text("filename"),
    key: text("key").notNull(),
    thumbKey: text("thumb_key"),
    contentType: text("content_type"),
    // bigint: videoer op til 4 GB er stoerre end integer (max ~2,1 GB). mode "number" er sikkert
    // op til 2^53 bytes.
    bytes: bigint("bytes", { mode: "number" }),
    width: integer("width"),
    height: integer("height"),
    durationS: real("duration_s"),
    favorite: boolean("favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("video_asset_key_idx").on(t.key),
    index("video_asset_group_idx").on(t.groupId),
  ]
);

export type VideoGroupRow = typeof videoGroup.$inferSelect;
export type VideoAssetRow = typeof videoAsset.$inferSelect;

export const videoGroupRelations = relations(videoGroup, ({ many }) => ({
  assets: many(videoAsset),
}));

export const videoAssetRelations = relations(videoAsset, ({ one }) => ({
  group: one(videoGroup, {
    fields: [videoAsset.groupId],
    references: [videoGroup.id],
  }),
}));
