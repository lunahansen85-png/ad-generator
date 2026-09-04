import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { adCopy } from "@/db/schema";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FIELDS = [
  "headline",
  "quote",
  "name",
  "source",
  "text",
  "subheadline",
  "body",
  "metaPrimaryText",
  "metaHeadline",
  "note",
] as const;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const b = await req.json();

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  for (const f of FIELDS) if (f in b) patch[f] = String(b[f] ?? "");
  if ("archived" in b) patch.archived = Boolean(b.archived);

  const [row] = await db.update(adCopy).set(patch).where(eq(adCopy.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Raekken findes ikke." }, { status: 404 });
  return NextResponse.json({ row });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await db.delete(adCopy).where(eq(adCopy.id, id));
  return NextResponse.json({ ok: true });
}
