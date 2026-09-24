import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { categorySettings } from "@/db/schema";
import { landingUrlMap } from "@/lib/category-settings";
import { normaliserLandingUrl } from "@/lib/landing-url";
import { isCategoryId } from "@/lib/video";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Indstillinger pr. kategori (24.09.2026). Lige nu kun landingssiden — den side, kategoriens
 * annoncer er lavet til. Biblioteket skriver den her; Ad Push laeser den med hver tekst/video
 * (`categoryLandingUrl` i /api/copy og /api/videos), saa den ikke skal vedligeholdes to steder.
 *
 * GET  → { landingUrls: { "<kategori>": "<url>" , … } }  (kun kategorier med en gemt raekke)
 * PUT  { category, landingUrl } → { category, landingUrl }  (tom landingUrl = ingen standard)
 */
export async function GET() {
  return NextResponse.json({ landingUrls: await landingUrlMap() });
}

export async function PUT(req: NextRequest) {
  const b = await req.json().catch(() => null);
  if (!b || typeof b !== "object") {
    return NextResponse.json({ error: "Ugyldig forespørgsel." }, { status: 400 });
  }
  const category = String((b as Record<string, unknown>).category ?? "");
  if (!isCategoryId(category)) {
    return NextResponse.json({ error: "Ukendt kategori." }, { status: 400 });
  }
  const res = normaliserLandingUrl((b as Record<string, unknown>).landingUrl);
  if (!res.ok) return NextResponse.json({ error: res.fejl }, { status: 400 });

  await db
    .insert(categorySettings)
    .values({ category, landingUrl: res.url })
    .onConflictDoUpdate({
      target: categorySettings.category,
      set: { landingUrl: res.url, updatedAt: new Date() },
    });

  return NextResponse.json({ category, landingUrl: res.url });
}
