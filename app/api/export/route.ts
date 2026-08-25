import { NextRequest } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adCopy } from "@/db/schema";
import { publicOrigin } from "@/lib/public-url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * CSV klar til at blive indsat i Ad Studio ("Indsaet CSV").
 * Kolonnerne matcher ads.csv i Meta CSV Uploader. image_url peger paa
 * den permanente /i/-URL, som Meta henter billedet fra ved upload.
 *
 * Ad Studio aendres IKKE — den laeser bare denne CSV som hidtil.
 */
function csvCell(v: string) {
  const s = v ?? "";
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const origin = publicOrigin(req);

  const rows = await db.query.adCopy.findMany({
    where: category ? eq(adCopy.category, category) : undefined,
    orderBy: [desc(adCopy.updatedAt)],
    with: { images: true },
  });

  const header = [
    "ad_name",
    "image_url",
    "primary_text",
    "headline",
    "description",
    "url",
    "cta",
    "adset_id",
    "status",
    "partner",
  ];

  const lines = [header.join(",")];

  for (const row of rows) {
    if (row.archived) continue;
    const primary =
      row.category === "morten" ? row.text : row.category === "retinol" ? row.body : row.quote;
    const headline =
      row.category === "testimonial" && !row.headline ? row.name : row.headline;

    for (const img of row.images) {
      lines.push(
        [
          csvCell(img.filename.replace(/\.jpg$/i, "")),
          csvCell(`${origin}/i/${img.key}`),
          csvCell(primary),
          csvCell(headline),
          "",
          "",
          "",
          "",
          "",
          row.category === "morten" ? "ja" : "nej",
        ].join(",")
      );
    }
  }

  return new Response(lines.join("\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="ad-studio-import.csv"',
    },
  });
}
