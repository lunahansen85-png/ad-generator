import { NextRequest, NextResponse } from "next/server";
import { generateMortens, generateTestimonials } from "@/lib/generate";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { category } = body;

  try {
    let images;

    if (category === "morten") {
      const text = String(body.text ?? "").trim();
      if (!text) {
        return NextResponse.json({ error: "Text is required." }, { status: 400 });
      }
      images = await generateMortens({ text });
    } else if (category === "testimonial") {
      const headline = String(body.headline ?? "").trim();
      const quote = String(body.quote ?? "").trim();
      const name = String(body.name ?? "").trim();
      const source = body.source === "trustpilot" ? "trustpilot" : "other";

      if (!quote || !name) {
        return NextResponse.json(
          { error: "Quote and name are required." },
          { status: 400 }
        );
      }
      images = await generateTestimonials({ headline, quote, name, source });
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
