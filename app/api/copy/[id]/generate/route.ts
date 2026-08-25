import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adCopy } from "@/db/schema";
import { generateAndStore } from "@/lib/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.query.adCopy.findFirst({ where: eq(adCopy.id, id) });
  if (!row) return NextResponse.json({ error: "Raekken findes ikke." }, { status: 404 });

  try {
    const stored = await generateAndStore(row);
    return NextResponse.json({ count: stored.length, images: stored });
  } catch (err) {
    console.error("generate fejlede", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generering fejlede." },
      { status: 500 }
    );
  }
}
