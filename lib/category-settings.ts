import { db } from "@/db";
import { categorySettings } from "@/db/schema";

/**
 * Kategoriernes landingssider som opslagstabel: { morten: "https://…", … }.
 * Tabellen har én raekke pr. kategori (hoejst en haandfuld), saa den hentes hel.
 * En kategori uden raekke — eller med tom vaerdi — giver "" = ingen standard.
 */
export async function landingUrlMap(): Promise<Record<string, string>> {
  const rows = await db.select().from(categorySettings);
  const map: Record<string, string> = {};
  for (const r of rows) map[r.category] = r.landingUrl;
  return map;
}
