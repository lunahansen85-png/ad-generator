import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureFontsRegistered } from "./canvas-helpers";
import {
  testimonialTemplates,
  RESIZE_OVERRIDES,
  TestimonialInput,
} from "./templates/testimonial";
import { mortenTemplates, MortenInput } from "./templates/morten";

export type GeneratedImage = {
  id: string;
  label: string;
  filename: string;
  buffer: Buffer;
};

async function renderBase(baseImagePath: string, resize?: [number, number]) {
  const img = await loadImage(baseImagePath);
  const [w, h] = resize ?? [img.width, img.height];
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, w, h);
  return { canvas, ctx };
}

function slugify(text: string, fallback: string) {
  const slug = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40);
  return slug || fallback;
}

export async function generateTestimonials(
  input: TestimonialInput
): Promise<GeneratedImage[]> {
  ensureFontsRegistered();
  const slug = slugify(input.headline || input.quote, "testimonial");
  const results: GeneratedImage[] = [];

  for (const tpl of testimonialTemplates) {
    if (tpl.requiresTrustpilot && input.source !== "trustpilot") continue;

    const resize = RESIZE_OVERRIDES[tpl.id];
    const { canvas, ctx } = await renderBase(tpl.baseImage, resize);
    tpl.render(ctx, canvas, input);

    const buffer = canvas.toBuffer("image/jpeg", 100);
    results.push({
      id: tpl.id,
      label: tpl.label,
      filename: `${tpl.outSuffix}_${slug}.jpg`,
      buffer,
    });
  }

  return results;
}

export async function generateMortens(input: MortenInput): Promise<GeneratedImage[]> {
  ensureFontsRegistered();
  const slug = slugify(input.text, "morten");
  const results: GeneratedImage[] = [];

  for (const tpl of mortenTemplates) {
    const { canvas, ctx } = await renderBase(tpl.baseImage);
    tpl.render(ctx, canvas, input);

    const buffer = canvas.toBuffer("image/jpeg", 100);
    results.push({
      id: tpl.id,
      label: tpl.label,
      filename: `${tpl.id}_${slug}.jpg`,
      buffer,
    });
  }

  return results;
}
