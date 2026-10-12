import { NextResponse } from "next/server";
import { layoutsForCategory } from "@/lib/layouts";
import { CATEGORIES } from "@/app/bibliotek/kategorier";

export const runtime = "nodejs";

/**
 * Layouts pr. kategori (12.10.2026) til afkrydsningslisten i biblioteket.
 * Biblioteket er "use client" og kan ikke importere skabelonerne direkte (de haenger paa
 * @napi-rs/canvas og filer paa disken), saa listen hentes her. Ren laesning — intet gemmes.
 *
 * GET → { layouts: { "<kategori>": [{ stem, label }, …] } }
 */
export async function GET() {
  const layouts: Record<string, { stem: string; label: string }[]> = {};
  for (const c of CATEGORIES) layouts[c.id] = layoutsForCategory(c.id);
  return NextResponse.json({ layouts });
}
