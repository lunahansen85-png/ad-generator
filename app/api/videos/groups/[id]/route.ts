import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { videoGroup } from "@/db/schema";
import { publicOrigin } from "@/lib/public-url";
import { isCategoryId, isUuid } from "@/lib/video";
import { loadGroup, toGroupJson } from "@/lib/video-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEXT_FIELDS = ["metaPrimaryText", "metaHeadline", "note"] as const;

/**
 * Ret én video (gruppe): name, category, metaPrimaryText, metaHeadline, note, archived.
 * Kun felter der er med i body aendres. Ingen haard sletning — "Arkivér" er archived: true.
 */
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Videoen findes ikke." }, { status: 404 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });

  const patch: Record<string, unknown> = { updatedAt: new Date() };
  if ("name" in b) {
    const name = String(b.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Videoen skal have et navn." }, { status: 400 });
    patch.name = name;
  }
  if ("category" in b) {
    if (!isCategoryId(b.category)) return NextResponse.json({ error: "Ugyldig kategori." }, { status: 400 });
    patch.category = b.category;
  }
  for (const f of TEXT_FIELDS) if (f in b) patch[f] = String(b[f] ?? "");
  if ("archived" in b) patch.archived = Boolean(b.archived);

  const [row] = await db.update(videoGroup).set(patch).where(eq(videoGroup.id, id)).returning();
  if (!row) return NextResponse.json({ error: "Videoen findes ikke." }, { status: 404 });
  const group = await loadGroup(id);
  return NextResponse.json({ group: group ? toGroupJson(group, publicOrigin(req)) : null });
}
