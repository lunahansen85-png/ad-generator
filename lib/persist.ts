import crypto from "crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adCopy, generatedImage, type AdCopyRow } from "@/db/schema";
import { putImage } from "./storage";
import { generateMortens, generateRetinols, generateTestimonials } from "./generate";

/**
 * Renderer alle skabeloner for én tekstraekke, lagrer dem i bucket og
 * opdaterer databasen.
 *
 * Noeglen indeholder et indholds-hash. Retter Luna en skabelon, aendrer
 * billedbytes sig -> ny noegle -> ny URL. Gamle URL'er bliver ved med at
 * virke, saa annoncer der allerede er oprettet aldrig gaar i stykker.
 */
export async function generateAndStore(row: AdCopyRow) {
  let images;
  if (row.category === "morten") {
    images = await generateMortens({ text: row.text });
  } else if (row.category === "retinol") {
    images = await generateRetinols({
      headline: row.headline,
      subheadline: row.subheadline,
      body: row.body,
    });
  } else {
    images = await generateTestimonials({
      headline: row.headline,
      quote: row.quote,
      name: row.name,
      source: row.source === "trustpilot" ? "trustpilot" : "other",
    });
  }

  const stored: { templateId: string; label: string; filename: string; key: string }[] = [];

  for (const img of images) {
    const hash = crypto.createHash("sha256").update(img.buffer).digest("hex").slice(0, 12);
    const key = `img/${row.id}/${img.id}/${hash}.jpg`;

    await putImage(key, img.buffer, "image/jpeg");

    await db
      .insert(generatedImage)
      .values({
        adCopyId: row.id,
        templateId: img.id,
        label: img.label,
        filename: img.filename,
        key,
        bytes: img.buffer.length,
      })
      .onConflictDoUpdate({
        target: [generatedImage.adCopyId, generatedImage.templateId],
        set: {
          key,
          label: img.label,
          filename: img.filename,
          bytes: img.buffer.length,
          createdAt: new Date(),
        },
      });

    stored.push({ templateId: img.id, label: img.label, filename: img.filename, key });
  }

  await db.update(adCopy).set({ updatedAt: new Date() }).where(eq(adCopy.id, row.id));
  return stored;
}
