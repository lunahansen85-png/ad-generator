import { GlobalFonts, SKRSContext2D } from "@napi-rs/canvas";
import path from "path";

let fontsRegistered = false;

export const FONT = {
  bold: "OpenSansBold",
  bold700: "OpenSansBold700",
  regular: "OpenSansRegular",
};

export function ensureFontsRegistered() {
  if (fontsRegistered) return;
  const fontsDir = path.join(process.cwd(), "assets", "fonts");
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "OpenSans-Bold.ttf"),
    FONT.bold
  );
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "OpenSans-Bold-700.ttf"),
    FONT.bold700
  );
  GlobalFonts.registerFromPath(
    path.join(fontsDir, "OpenSans-Regular.ttf"),
    FONT.regular
  );
  fontsRegistered = true;
}

export function fontStr(family: string, size: number) {
  return `${size}px ${family}`;
}

/** Greedy word-wrap, mirrors the Python wrap_text() used by every template script. */
export function wrapText(
  ctx: SKRSContext2D,
  text: string,
  font: string,
  maxWidth: number
): string[] {
  ctx.font = font;
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const test = (current + " " + word).trim();
    if (ctx.measureText(test).width <= maxWidth) {
      current = test;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Height of a single line of text. Uses the font's own ascent/descent metrics
 * (not the tight bounding box of the specific glyphs) because every draw call in
 * this app uses textBaseline="top", which anchors to those same font metrics.
 * Sizing boxes off the tighter actual-glyph box (e.g. a word with no descenders)
 * while drawing with the taller font-metric box caused text to render lower than
 * expected and get cropped by its own box.
 */
export function lineHeight(ctx: SKRSContext2D, text: string, font: string): number {
  ctx.font = font;
  const m = ctx.measureText(text || "Mg");
  return (m.fontBoundingBoxAscent || 0) + (m.fontBoundingBoxDescent || 0);
}

export function textWidth(ctx: SKRSContext2D, text: string, font: string): number {
  ctx.font = font;
  return ctx.measureText(text).width;
}

/** Sum of line heights + spacing between them, mirroring multiline_textbbox height. */
export function multilineHeight(
  ctx: SKRSContext2D,
  lines: string[],
  font: string,
  spacing: number
): number {
  const heights = lines.map((l) => lineHeight(ctx, l, font));
  return heights.reduce((a, b) => a + b, 0) + spacing * Math.max(0, lines.length - 1);
}

type Align = "left" | "center";

/** Draws left/center aligned multiline text with optional stroke, top-anchored at y. */
export function drawMultilineText(
  ctx: SKRSContext2D,
  lines: string[],
  x: number,
  y: number,
  font: string,
  opts: {
    fill: string;
    spacing: number;
    align?: Align;
    strokeWidth?: number;
    strokeColor?: string;
  }
) {
  const align = opts.align ?? "left";
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.textAlign = align === "center" ? "center" : "left";
  let cursorY = y;
  for (const line of lines) {
    const h = lineHeight(ctx, line, font);
    if (opts.strokeWidth && opts.strokeWidth > 0) {
      ctx.lineWidth = opts.strokeWidth * 2;
      ctx.strokeStyle = opts.strokeColor ?? opts.fill;
      ctx.lineJoin = "round";
      ctx.strokeText(line, x, cursorY);
    }
    ctx.fillStyle = opts.fill;
    ctx.fillText(line, x, cursorY);
    cursorY += h + opts.spacing;
  }
}

export function drawSingleText(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  font: string,
  opts: {
    fill: string;
    align?: Align;
    strokeWidth?: number;
    strokeColor?: string;
  }
) {
  drawMultilineText(ctx, [text], x, y, font, { ...opts, spacing: 0 });
}

/** Finds the largest font size in [minSize, maxSize] (stepping down) whose wrapped
 * block height fits within availableHeight. Mirrors the `for size in range(...)` loops. */
export function autoFitSize(
  ctx: SKRSContext2D,
  text: string,
  fontFamily: string,
  maxSize: number,
  minSize: number,
  step: number,
  maxWidth: number,
  availableHeight: number,
  spacingFn: (size: number) => number
): { size: number; lines: string[]; spacing: number; blockHeight: number } {
  let result: { size: number; lines: string[]; spacing: number; blockHeight: number } | null =
    null;
  for (let size = maxSize; size >= minSize; size -= step) {
    const font = fontStr(fontFamily, size);
    const spacing = spacingFn(size);
    const lines = wrapText(ctx, text, font, maxWidth);
    const blockHeight = multilineHeight(ctx, lines, font, spacing);
    result = { size, lines, spacing, blockHeight };
    if (blockHeight <= availableHeight) break;
  }
  return result!;
}

/** Regular 5-point star polygon, matching the Python draw_star() helper. */
export function drawStar(
  ctx: SKRSContext2D,
  cx: number,
  cy: number,
  rOuter: number,
  rInner: number,
  fill: string
) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const r = i % 2 === 0 ? rOuter : rInner;
    const px = cx + r * Math.cos(angle);
    const py = cy + r * Math.sin(angle);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}

export function rgb(r: number, g: number, b: number) {
  return `rgb(${r}, ${g}, ${b})`;
}
