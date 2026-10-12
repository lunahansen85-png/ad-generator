import { NextRequest, NextResponse } from "next/server";
import { generateMortens, generateRetinols, generateTestimonials } from "@/lib/generate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category } = body;
  // `layouts` (12.10.2026) = de valgte layout-stammer, fx ["morten_3"] → baade 1:1 og 9:16.
  // Mangler feltet, laves alle layouts praecis som foer.
  const layouts = Array.isArray(body.layouts)
    ? body.layouts.filter((v: unknown): v is string => typeof v === "string")
    : undefined;

  try {
    let images;

    if (category === "morten") {
      const text = String(body.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "Text is required." }, { status: 400 });
      }
      images = await generateMortens({ text }, layouts);
    } else if (category === "testimonial") {
      const headline = String(body.headline ?? "").trim();
      const quote = String(body.quote ?? "").trim();
      const name = String(body.name ?? "").trim();
      const srcRaw = String(body.source ?? "").trim().toLowerCase();
      const source = (srcRaw === "trustpilot" || srcRaw === "tp") ? "trustpilot" : "other";

      if (!quote || !name) {
        return NextResponse.json(
          { error: "Quote and name are required." },
          { status: 400 }
        );
      }
      const formatsOnly = body.formatsOnly === true;
      images = await generateTestimonials({ headline, quote, name, source }, formatsOnly, layouts);
    } else if (category === "retinol") {
      const headline = String(body.headline ?? "").trim();
      const subheadline = String(body.subheadline ?? "").trim();
      const retinolBody = String(body.body ?? "").trim();

      if (!headline) {
        return NextResponse.json({ error: "Headline is required." }, { status: 400 });
      }
      images = await generateRetinols({ headline, subheadline, body: retinolBody }, layouts);
    } else {
      return NextResponse.json({ error: "Unknown category." }, { status: 400 });
    }

    return NextResponse.json({
      images: images.map((img) => ({
        id: img.id,
        label: img.label,
        filename: img.filename,
        dataUrl: `data:image/jpeg;base64,${img.buffer.toString("base64")}`,
      })),
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Something went wrong generating images." },
      { status: 500 }
    );
  }
}
