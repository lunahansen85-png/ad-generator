import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ensureFontsRegistered } from "./canvas-helpers";
import {
  testimonialTemplates,
  testimonialFormatTemplates,
  RESIZE_OVERRIDES,
  TestimonialInput,
} from "./templates/testimonial";
import { mortenTemplates, MortenInput } from "./templates/morten";
import { retinolTemplates, RetinolInput } from "./templates/retinol";
import { filterByLayouts } from "./layouts";

// `layouts` paa de tre generate-funktioner (12.10.2026) = de valgte layout-STAMMER, fx
// ["morten_3"] → baade 1:1 og 9:16. Tom eller udeladt = alle layouts, praecis som foer.
// Filtret laegges EFTER de filtre der allerede var der, saa en skabelon uden maal
// stadig springes over.

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

// Resize + center-crop to target dimensions (mirrors the Python scale+crop logic).
async function renderBaseResizeCrop(baseImagePath: string, w: number, h: number) {
  const img = await loadImage(baseImagePath);
  const scale = Math.max(w / img.width, h / img.height);
  const nw = img.width * scale;
  const nh = img.height * scale;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, (w - nw) / 2, (h - nh) / 2, nw, nh);
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
  input: TestimonialInput,
  formatsOnly = false,
  layouts?: string[] | null
): Promise<GeneratedImage[]> {
  ensureFontsRegistered();
  const slug = slugify(input.headline || input.quote, "testimonial");
  const results: GeneratedImage[] = [];

  const allTpls = filterByLayouts(
    formatsOnly
      ? testimonialFormatTemplates
      : [...testimonialTemplates, ...testimonialFormatTemplates],
    layouts
  );
  for (const tpl of allTpls) {
    if (tpl.requiresTrustpilot && input.source !== "trustpilot") continue;

    const { canvas, ctx } = tpl.resizeCrop && tpl.width && tpl.height
      ? await renderBaseResizeCrop(tpl.baseImage, tpl.width, tpl.height)
      : await renderBase(tpl.baseImage, RESIZE_OVERRIDES[tpl.id]);
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

export async function generateRetinols(
  input: RetinolInput,
  layouts?: string[] | null
): Promise<GeneratedImage[]> {
  ensureFontsRegistered();
  const slug = slugify(input.headline, "retinol");
  const results: GeneratedImage[] = [];

  for (const tpl of filterByLayouts(retinolTemplates.filter((t) => t.width && t.height), layouts)) {
    const { canvas, ctx } = tpl.width && tpl.height
      ? await renderBaseResizeCrop(tpl.baseImage, tpl.width, tpl.height)
      : await renderBase(tpl.baseImage);
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

export async function generateMortens(
  input: MortenInput,
  layouts?: string[] | null
): Promise<GeneratedImage[]> {
  ensureFontsRegistered();
  const slug = slugify(input.text, "morten");
  const results: GeneratedImage[] = [];

  for (const tpl of filterByLayouts(mortenTemplates.filter((t) => t.width && t.height), layouts)) {
    const { canvas, ctx } = tpl.width && tpl.height
      ? await renderBaseResizeCrop(tpl.baseImage, tpl.width, tpl.height)
      : await renderBase(tpl.baseImage);
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
