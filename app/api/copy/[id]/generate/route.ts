import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adCopy } from "@/db/schema";
import { generateAndStore } from "@/lib/persist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const row = await db.query.adCopy.findFirst({ where: eq(adCopy.id, id) });
  if (!row) return NextResponse.json({ error: "Raekken findes ikke." }, { status: 404 });

  // Kroppen er VALGFRI: biblioteket kaldte ruten uden krop foer 12.10.2026, og `req.json()`
  // kaster paa en tom krop — derfor `.catch`. `layouts` = de valgte layout-stammer; mangler
  // feltet, laves alle layouts som hidtil.
  const body = (await req.json().catch(() => ({}))) as { layouts?: unknown };
  const layouts = Array.isArray(body?.layouts)
    ? body.layouts.filter((v): v is string => typeof v === "string")
    : undefined;

  try {
    const stored = await generateAndStore(row, layouts);
    return NextResponse.json({ count: stored.length, images: stored });
  } catch (err) {
    console.error("generate fejlede", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generering fejlede." },
      { status: 500 }
    );
  }
}
