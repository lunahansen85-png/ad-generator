import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { generatedImage } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.query.generatedImage.findFirst({ where: eq(generatedImage.id, id) });
  if (!row) return NextResponse.json({ error: "Billedet findes ikke." }, { status: 404 });

  const newValue = !row.favorite;
  await db.update(generatedImage).set({ favorite: newValue }).where(eq(generatedImage.id, id));
  return NextResponse.json({ favorite: newValue });
}
