import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adCopy } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CATEGORIES = ["morten", "testimonial", "retinol"] as const;

export async function GET(req: NextRequest) {
  const category = req.nextUrl.searchParams.get("category");
  const rows = await db.query.adCopy.findMany({
    where: category ? eq(adCopy.category, category) : undefined,
    orderBy: [desc(adCopy.updatedAt)],
    with: { images: true },
  });
  return NextResponse.json({ rows });
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
