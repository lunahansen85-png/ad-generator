import {
  pgTable,
  text,
  boolean,
  integer,
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
