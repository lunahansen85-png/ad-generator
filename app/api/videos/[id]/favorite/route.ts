import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videoAsset } from "@/db/schema";
import { isUuid } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Samme adfaerd som app/api/image/[id]/favorite: skifter ⭐ og returnerer den nye vaerdi.
export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Videoen findes ikke." }, { status: 404 });
  const row = await db.query.videoAsset.findFirst({ where: eq(videoAsset.id, id) });
  if (!row) return NextResponse.json({ error: "Videoen findes ikke." }, { status: 404 });

  const newValue = !row.favorite;
  await db.update(videoAsset).set({ favorite: newValue }).where(eq(videoAsset.id, id));
  return NextResponse.json({ favorite: newValue });
}
