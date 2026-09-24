import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adCopy } from "@/db/schema";
import { landingUrlMap } from "@/lib/category-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["morten", "testimonial", "retinol"] as const;

/**
 * `categoryLandingUrl` (24.09.2026) foelger med hver raekke: kategoriens standard-landingsside
 * fra category_settings, eller "" hvis der ingen er. Ad Push laeser den pr. raekke og behoever
 * ikke kende kategori-listen. Alle raekker i samme kategori har samme vaerdi. `landingUrls` er
 * det samme opslag samlet, til klienter der vil have hele billedet paa én gang.
 */
export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const [rows, landingUrls] = await Promise.all([
    db.query.adCopy.findMany({
      where: category ? eq(adCopy.category, category) : undefined,
      orderBy: [desc(adCopy.updatedAt)],
      with: { images: true },
    }),
    landingUrlMap(),
  ]);
  return NextResponse.json({
    rows: rows.map((r) => ({ ...r, categoryLandingUrl: landingUrls[r.category] ?? "" })),
    landingUrls,
  });
}

export async function POST(req: NextRequest) {
  const b = await req.json();
  const category = String(b.category ?? "");
  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    return NextResponse.json({ error: "Ukendt kategori." }, { status: 400 });
  }
  const [row] = await db
    .insert(adCopy)
    .values({
      category,
      headline: String(b.headline ?? ""),
      quote: String(b.quote ?? ""),
      name: String(b.name ?? ""),
      source: b.source === "trustpilot" ? "trustpilot" : "other",
      text: String(b.text ?? ""),
      subheadline: String(b.subheadline ?? ""),
      body: String(b.body ?? ""),
      metaPrimaryText: String(b.metaPrimaryText ?? ""),
      metaHeadline: String(b.metaHeadline ?? ""),
      note: String(b.note ?? ""),
    })
    .returning();
  return NextResponse.json({ row });
}
