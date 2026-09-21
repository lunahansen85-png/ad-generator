import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videoAsset } from "@/db/schema";
import { isUuid } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Omdoeb én variant (fx "Hook 1" → "Hook 1 – spoergsmaal"). Body: { variant }. */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Varianten findes ikke." }, { status: 404 });
  const b = await req.json().catch(() => null);
  const variant = String(b?.variant ?? "").trim();
  if (!variant) return NextResponse.json({ error: "Varianten skal have et navn." }, { status: 400 });

  const [row] = await db.update(videoAsset).set({ variant }).where(eq(videoAsset.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Varianten findes ikke." }, { status: 404 });
  return NextResponse.json({ video: { id: row.id, variant: row.variant } });
}
