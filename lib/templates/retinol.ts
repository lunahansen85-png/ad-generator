import { SKRSContext2D, Canvas } from "@napi-rs/canvas";
import path from "path";
import {
  FONT,
  autoFitSize,
  drawMultilineText,
  fontStr,
  lineHeight,
  multilineHeight,
  rgb,
  textWidth,
  wrapText,
} from "../canvas-helpers";

export type RetinolInput = {
  headline: string;
  subheadline: string;
  body: string;
};

export type RetinolTemplate = {
  id: string;
  label: string;
  baseImage: string;
  outSuffix: string;
  width?: number;
  height?: number;
  render: (ctx: SKRSContext2D, canvas: Canvas, input: RetinolInput) => void;
};

const BASES = path.join(process.cwd(), "assets", "bases");

function combine(headline: string, subheadline: string): string {
  return [headline, subheadline].filter((s) => s.trim()).join(" ");
}

/** Draws per-line rounded-rect "highlighter" boxes behind text, centered
 * horizontally on imgW, matching the draw_rounded_rect + two-pass pattern
 * used by retinol_4/7/10's Python scripts. */
function drawHighlightedLines(
  ctx: SKRSContext2D,
  lines: string[],
  font: string,
  opts: {
    imgW: number;
    yTop: number;
    padX: number;
    padY: number;
    radius: number;
    lineSpacing: number;
    boxColor: string;
    textColor: string;
    extraBottomPad?: number;
  }
) {
  const metrics = lines.map((line) => ({
    w: textWidth(ctx, line, font),
    h: lineHeight(ctx, line, font),
  }));

  let y = opts.yTop;
  for (const { w, h } of metrics) {
    const x0 = opts.imgW / 2 - w / 2 - opts.padX;
    const x1 = opts.imgW / 2 + w / 2 + opts.padX;
    const y0 = y - opts.padY;
    const y1 = y + h + opts.padY + (opts.extraBottomPad ?? 0);
    ctx.beginPath();
    ctx.roundRect(x0, y0, x1 - x0, y1 - y0, opts.radius);
    ctx.fillStyle = opts.boxColor;
    ctx.fill();
    y += h + opts.lineSpacing;
  }

  y = opts.yTop;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillStyle = opts.textColor;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], opts.imgW / 2, y);
    y += metrics[i].h + opts.lineSpacing;
  }
}

// Ink-metrics variant of drawHighlightedLines — matches Python's anchor="mt" + bbox ink height
function drawHighlightedLinesInk(
  ctx: SKRSContext2D,
  lines: string[],
  font: string,
  opts: {
    imgW: number; yTop: number; padX: number; padY: number;
    radius: number; lineSpacing: number; boxColor: string; textColor: string;
  }
) {
  ctx.font = font;
  const metrics = lines.map((line) => {
    const mw = ctx.measureText(line);
    const mh = ctx.measureText(line || "Ag");
    const asc = mh.actualBoundingBoxAscent || 0;
    return {
      w: mw.width,
      h: asc + (mh.actualBoundingBoxDescent || 0),
      asc,
    };
  });

  let y = opts.yTop;
  for (const { w, h } of metrics) {
    ctx.beginPath();
    ctx.roundRect(opts.imgW / 2 - w / 2 - opts.padX, y - opts.padY,
      w + opts.padX * 2, h + opts.padY * 2, opts.radius);
    ctx.fillStyle = opts.boxColor;
    ctx.fill();
    y += h + opts.lineSpacing;
  }

  y = opts.yTop;
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = opts.textColor;
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], opts.imgW / 2, y + metrics[i].asc);
    y += metrics[i].h + opts.lineSpacing;
  }
}

// ---------------------------------------------------------------------------
// Markdown-style "**bold**" mixed-weight text, used by retinol_8/9/10.
// ---------------------------------------------------------------------------

type Segment = { word: string; bold: boolean };

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  const parts = text.split(/(\*\*.*?\*\*)/);
  for (const part of parts) {
    if (part.startsWith("**") && part.endsWith("**")) {
      for (const w of part.slice(2, -2).split(" ")) {
        if (w) segments.push({ word: w, bold: true });
      }
    } else {
      for (const w of part.split(" ")) {
        if (w) segments.push({ word: w, bold: false });
      }
    }
  }
  return segments;
}

function layoutSegments(
  ctx: SKRSContext2D,
  segments: Segment[],
  regFont: string,
  boldFont: string,
  maxWidth: number
): Segment[][] {
  const lines: Segment[][] = [];
  let current: Segment[] = [];
  let currentW = 0;
  for (const seg of segments) {
    const font = seg.bold ? boldFont : regFont;
    ctx.font = font;
    const wordW = ctx.measureText(seg.word).width;
    const spaceW = ctx.measureText(" ").width;
    const needed = current.length ? spaceW + wordW : wordW;
    if (currentW + needed > maxWidth && current.length) {
      lines.push(current);
      current = [seg];
      currentW = wordW;
    } else {
      current.push(seg);
      currentW += needed;
    }
  }
  if (current.length) lines.push(current);
  return lines;
}

function segmentLineHeight(
  ctx: SKRSContext2D,
  line: Segment[],
  regFont: string,
  boldFont: string
): number {
  let max = 0;
  for (const seg of line) {
    const h = lineHeight(ctx, seg.word, seg.bold ? boldFont : regFont);
    if (h > max) max = h;
  }
  return max;
}

// Ink-based metrics (actual bounding box, matching Python's bbox[3]-bbox[1] behavior)
function segmentLineInkMetrics(
  ctx: SKRSContext2D,
  line: Segment[],
  regFont: string,
  boldFont: string
): { height: number; ascent: number } {
  let maxH = 0, maxAsc = 0;
  for (const seg of line) {
    const font = seg.bold ? boldFont : regFont;
    ctx.font = font;
    const m = ctx.measureText(seg.word || "Ag");
    const asc = m.actualBoundingBoxAscent || 0;
    const h = asc + (m.actualBoundingBoxDescent || 0);
    if (h > maxH) { maxH = h; maxAsc = asc; }
  }
  return { height: maxH, ascent: maxAsc };
}

function inkMeasureStr(ctx: SKRSContext2D, text: string, font: string): { height: number; ascent: number } {
  ctx.font = font;
  const m = ctx.measureText(text || "Ag");
  const asc = m.actualBoundingBoxAscent || 0;
  return { height: asc + (m.actualBoundingBoxDescent || 0), ascent: asc };
}

function segmentLineWidth(
  ctx: SKRSContext2D,
  line: Segment[],
  regFont: string,
  boldFont: string
): number {
  let w = 0;
  for (let i = 0; i < line.length; i++) {
    const seg = line[i];
    const font = seg.bold ? boldFont : regFont;
    ctx.font = font;
    w += ctx.measureText(seg.word).width;
    if (i < line.length - 1) w += ctx.measureText(" ").width;
  }
  return w;
}

// y = ink-top of the line, inkAscent = distance from ink-top to baseline
function drawSegmentLine(
  ctx: SKRSContext2D,
  line: Segment[],
  startX: number,
  y: number,
  regFont: string,
  boldFont: string,
  color: string,
  inkAscent: number = 0
) {
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = color;
  let x = startX;
  for (let i = 0; i < line.length; i++) {
    const seg = line[i];
    const font = seg.bold ? boldFont : regFont;
    ctx.font = font;
    ctx.fillText(seg.word, x, y + inkAscent);
    const wordW = ctx.measureText(seg.word).width;
    if (i < line.length - 1) {
      x += wordW + ctx.measureText(" ").width;
    }
  }
}

// ---------------------------------------------------------------------------

export const retinolTemplates: RetinolTemplate[] = [
  {
    id: "retinol_1",
    label: "Retinol 1",
    baseImage: path.join(BASES, "retinol_base_1.jpg"),
    outSuffix: "retinol1",
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0, 0, 0);
      const DARK = rgb(40, 40, 40);
      const CARD_LEFT = 220,
        CARD_RIGHT = 695,
        CARD_TOP = 308,
        CARD_BOTTOM = 820;
      const MAX_W = CARD_RIGHT - CARD_LEFT;
      let y = CARD_TOP;

      if (headline) {
        const font = fontStr(FONT.bold700, 38);
        const lines = wrapText(ctx, headline, font, MAX_W);
        drawMultilineText(ctx, lines, CARD_LEFT, y, font, { fill: BLACK, spacing: 2 });
        y += multilineHeight(ctx, lines, font, 2) + 12;
      }
      if (subheadline) {
        const font = fontStr(FONT.bold700, 22);
        const lines = wrapText(ctx, subheadline, font, MAX_W);
        drawMultilineText(ctx, lines, CARD_LEFT, y, font, { fill: BLACK, spacing: 1 });
        y += multilineHeight(ctx, lines, font, 1) + 24;
      }
      if (body) {
        const availableH = CARD_BOTTOM - y - 10;
        const fit = autoFitSize(ctx, body, FONT.regular, 24, 10, 1, MAX_W, availableH, () => 6);
        const font = fontStr(FONT.regular, fit.size);
        drawMultilineText(ctx, fit.lines, CARD_LEFT, y, font, {
          fill: DARK,
          spacing: fit.spacing,
        });
      }
    },
  },
  {
    id: "retinol_2",
    label: "Retinol 2",
    baseImage: path.join(BASES, "retinol_base_2.jpg"),
    outSuffix: "retinol2",
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0, 0, 0);
      const DARK = rgb(40, 40, 40);
      const TEXT_LEFT = 99,
        TEXT_RIGHT = 524,
        TEXT_TOP = 45,
        TEXT_BOTTOM = 1085;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      let y = TEXT_TOP;

      const combinedHl = combine(headline, subheadline);
      if (combinedHl) {
        const availableHlH = Math.floor((TEXT_BOTTOM - TEXT_TOP) / 2);
        const fit = autoFitSize(
          ctx,
          combinedHl,
          FONT.bold700,
          36,
          24,
          1,
          MAX_W,
          availableHlH,
          () => 4
        );
        const font = fontStr(FONT.bold700, fit.size);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, y, font, {
          fill: BLACK,
          spacing: fit.spacing,
        });
        y += fit.blockHeight + 40;
      }
      if (body) {
        const availableH = TEXT_BOTTOM - y;
        const fit = autoFitSize(ctx, body, FONT.regular, 32, 10, 1, MAX_W, availableH, () => 8);
        const font = fontStr(FONT.regular, fit.size);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, y, font, {
          fill: DARK,
          spacing: fit.spacing,
        });
      }
    },
  },
  {
    id: "retinol_3",
    label: "Retinol 3",
    baseImage: path.join(BASES, "retinol_base_3.jpg"),
    outSuffix: "retinol3",
    render(ctx, canvas, { headline, subheadline }) {
      const WHITE = rgb(255, 255, 255);
      const CENTER_X = 1294 / 2;
      const MAX_W = 1150;
      const Y_HEADLINE = 210;

      let y = Y_HEADLINE;
      if (headline) {
        const font = fontStr(FONT.serifBold, 80);
        const lines = wrapText(ctx, headline, font, MAX_W);
        y = Y_HEADLINE - (lines.length > 2 ? 20 : 0);
        drawMultilineText(ctx, lines, CENTER_X, y, font, {
          fill: WHITE,
          spacing: 13,
          align: "center",
        });
        y += multilineHeight(ctx, lines, font, 13) + 60;
      }
      if (subheadline) {
        const font = fontStr(FONT.serifBold, 62);
        const lines = wrapText(ctx, subheadline, font, MAX_W);
        drawMultilineText(ctx, lines, CENTER_X, y, font, {
          fill: WHITE,
          spacing: 12,
          align: "center",
        });
      }
    },
  },
  {
    id: "retinol_4",
    label: "Retinol 4",
    baseImage: path.join(BASES, "retinol_base_4.jpg"),
    outSuffix: "retinol4",
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0, 0, 0);
      const WHITE = rgb(255, 255, 255);
      const DARK = rgb(30, 30, 30);
      const IMG_W = 978;

      const combinedHl = combine(headline, subheadline);
      const hlFont = fontStr(FONT.bold700, 36);
      const hlLines = wrapText(ctx, combinedHl, hlFont, 680);
      drawHighlightedLines(ctx, hlLines, hlFont, {
        imgW: IMG_W,
        yTop: 130,
        padX: 18,
        padY: 14,
        radius: 14,
        lineSpacing: 10,
        boxColor: BLACK,
        textColor: WHITE,
      });

      if (body) {
        const GREY_TOP = 990,
          GREY_BOTTOM = 1220,
          TEXT_LEFT = 50,
          TEXT_RIGHT = 928;
        const MAX_W_BODY = TEXT_RIGHT - TEXT_LEFT;
        const fit = autoFitSize(
          ctx,
          body,
          FONT.bold700,
          30,
          14,
          1,
          MAX_W_BODY,
          GREY_BOTTOM - GREY_TOP,
          () => 10
        );
        const font = fontStr(FONT.bold700, fit.size);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, GREY_TOP, font, {
          fill: DARK,
          spacing: fit.spacing,
        });
      }
    },
  },
  {
    id: "retinol_5",
    label: "Retinol 5",
    baseImage: path.join(BASES, "retinol_base_4.jpg"),
    outSuffix: "retinol5",
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20, 20, 20);
      const GREY_TOP = 975,
        GREY_BOTTOM = 1230,
        TEXT_LEFT = 50,
        TEXT_RIGHT = 928;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      const greyH = GREY_BOTTOM - GREY_TOP;

      const combined = combine(headline, subheadline);
      const fit = autoFitSize(ctx, combined, FONT.bold700, 54, 20, 1, MAX_W, greyH, () => 8);
      const font = fontStr(FONT.bold700, fit.size);
      const textY = GREY_TOP + Math.floor((greyH - fit.blockHeight) / 2);
      drawMultilineText(ctx, fit.lines, TEXT_LEFT, textY, font, {
        fill: DARK,
        spacing: fit.spacing,
      });
    },
  },
  {
    id: "retinol_6",
    label: "Retinol 6",
    baseImage: path.join(BASES, "retinol_base_6.jpg"),
    outSuffix: "retinol6",
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20, 20, 20);
      const GREY_TOP = 1058,
        GREY_BOTTOM = 1360,
        TEXT_LEFT = 55,
        TEXT_RIGHT = 1043;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      const greyH = GREY_BOTTOM - GREY_TOP;

      const combined = combine(headline, subheadline);
      const fit = autoFitSize(ctx, combined, FONT.bold700, 54, 20, 1, MAX_W, greyH, () => 8);
      const font = fontStr(FONT.bold700, fit.size);
      const textY = GREY_TOP + Math.floor((greyH - fit.blockHeight) / 2);
      drawMultilineText(ctx, fit.lines, TEXT_LEFT, textY, font, {
        fill: DARK,
        spacing: fit.spacing,
      });
    },
  },
  {
    id: "retinol_7",
    label: "Retinol 7",
    baseImage: path.join(BASES, "retinol_base_7.jpg"),
    outSuffix: "retinol7",
    render(ctx, canvas, { headline, subheadline }) {
      const BLACK = rgb(0, 0, 0);
      const WHITE = rgb(255, 255, 255);
      const IMG_W = 1090;

      const combined = combine(headline, subheadline);
      const font = fontStr(FONT.bold700, 60);
      const lines = wrapText(ctx, combined, font, 960);
      drawHighlightedLinesInk(ctx, lines, font, {
        imgW: IMG_W, yTop: 100, padX: 18, padY: 14,
        radius: 16, lineSpacing: 18, boxColor: BLACK, textColor: WHITE,
      });
    },
  },
  {
    id: "retinol_8",
    label: "Retinol 8",
    baseImage: path.join(BASES, "retinol_base_8.jpg"),
    outSuffix: "retinol8",
    render(ctx, canvas, { headline, subheadline }) {
      const WHITE = rgb(255, 255, 255);
      const TEXT_LEFT = 50,
        TEXT_RIGHT = 870,
        TEXT_Y_START = 618,
        TEXT_BOTTOM = 880;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      const LINE_SPACING = 12;

      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);

      let size = 44;
      let lines: Segment[][] = [];
      for (size = 44; size >= 20; size--) {
        const regFont = fontStr(FONT.regular, size);
        const boldFont = fontStr(FONT.bold700, size);
        lines = layoutSegments(ctx, segments, regFont, boldFont, MAX_W);
        const totalH = lines.reduce((a, l) => a + segmentLineInkMetrics(ctx, l, regFont, boldFont).height, 0) + LINE_SPACING * (lines.length - 1);
        if (totalH <= TEXT_BOTTOM - TEXT_Y_START) break;
      }

      const regFont = fontStr(FONT.regular, size);
      const boldFont = fontStr(FONT.bold700, size);
      let y = TEXT_Y_START;
      for (const line of lines) {
        const { height: h, ascent } = segmentLineInkMetrics(ctx, line, regFont, boldFont);
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, WHITE, ascent);
        y += h + LINE_SPACING;
      }
    },
  },
  {
    id: "retinol_9",
    label: "Retinol 9",
    baseImage: path.join(BASES, "retinol_base_9.jpg"),
    outSuffix: "retinol9",
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20, 20, 20);
      const BOX_TOP = 649,
        BOX_BOTTOM = 949;
      const PAD_X = 55,
        PAD_Y = 45;
      const TEXT_LEFT = 92 + PAD_X;
      const TEXT_RIGHT = 1087 - PAD_X;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      const TEXT_Y = BOX_TOP + PAD_Y;
      const TEXT_BOTTOM = BOX_BOTTOM - PAD_Y;
      const LINE_SPACING = 14;

      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);

      let size = 46;
      let lines: Segment[][] = [];
      for (size = 46; size >= 20; size--) {
        const regFont = fontStr(FONT.regular, size);
        const boldFont = fontStr(FONT.bold700, size);
        lines = layoutSegments(ctx, segments, regFont, boldFont, MAX_W);
        const { height: refLh } = inkMeasureStr(ctx, "Ag", boldFont);
        const totalH = refLh * lines.length + LINE_SPACING * (lines.length - 1);
        if (totalH <= TEXT_BOTTOM - TEXT_Y) break;
      }

      const boldFont = fontStr(FONT.bold700, size);
      const regFont = fontStr(FONT.regular, size);
      const { height: fixedLh, ascent: fixedAsc } = inkMeasureStr(ctx, "Ag", boldFont);
      const totalH = fixedLh * lines.length + LINE_SPACING * (lines.length - 1);
      const boxMid = (BOX_TOP + BOX_BOTTOM) / 2;
      let y = boxMid - totalH / 2 - 15;
      for (const line of lines) {
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, DARK, fixedAsc);
        y += fixedLh + LINE_SPACING;
      }
    },
  },
  {
    id: "retinol_10",
    label: "Retinol 10",
    baseImage: path.join(BASES, "retinol_base_10.jpg"),
    outSuffix: "retinol10",
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(15, 15, 15);
      const WHITE = rgb(255, 255, 255);
      const IMG_W = 838;
      const HEADLINE_SIZE = 40;
      const LINE_SPACING = 20;
      const PAD_Y = 14;

      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);
      const regFont = fontStr(FONT.regular, HEADLINE_SIZE);
      const boldFont = fontStr(FONT.bold700, HEADLINE_SIZE);
      const lines = layoutSegments(ctx, segments, regFont, boldFont, 760);

      const metrics = lines.map((line) => ({
        w: segmentLineWidth(ctx, line, regFont, boldFont),
        ...segmentLineInkMetrics(ctx, line, regFont, boldFont),
      }));

      let y = 55;
      for (const { w, height } of metrics) {
        ctx.beginPath();
        ctx.roundRect(IMG_W / 2 - w / 2 - 18, y - PAD_Y, w + 36, height + PAD_Y * 2 + 14, 14);
        ctx.fillStyle = WHITE; ctx.fill();
        y += height + LINE_SPACING;
      }

      y = 55;
      for (let i = 0; i < lines.length; i++) {
        const { w, height, ascent } = metrics[i];
        drawSegmentLine(ctx, lines[i], IMG_W / 2 - w / 2, y, regFont, boldFont, DARK, ascent);
        y += height + LINE_SPACING;
      }
    },
  },

  // ── 9×16 format variants ──────────────────────────────────────────────────

  {
    id: "retinol_1_9x16", label: "Retinol 1 – 9×16",
    baseImage: path.join(BASES, "retinol_base_1_9x16.jpg"),
    outSuffix: "retinol1", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0,0,0), DARK = rgb(40,40,40);
      const CARD_LEFT=273, CARD_RIGHT=813, CARD_TOP=445, CARD_BOTTOM=1390;
      const MAX_W = CARD_RIGHT - CARD_LEFT;
      let y = CARD_TOP;
      const combinedHl = combine(headline, subheadline);
      if (combinedHl) {
        const fit = autoFitSize(ctx, combinedHl, FONT.bold700, 56, 18, 1, MAX_W, 320, () => 4);
        drawMultilineText(ctx, fit.lines, CARD_LEFT, y, fontStr(FONT.bold700, fit.size), { fill: BLACK, spacing: fit.spacing });
        y += fit.blockHeight + 30;
      }
      if (subheadline && headline) {
        // subheadline already included in combinedHl above
      }
      if (body) {
        const availableH = CARD_BOTTOM - y - 10;
        const fit = autoFitSize(ctx, body, FONT.regular, 34, 14, 1, MAX_W, availableH, () => 6);
        drawMultilineText(ctx, fit.lines, CARD_LEFT, y, fontStr(FONT.regular, fit.size), { fill: DARK, spacing: fit.spacing });
      }
    },
  },
  {
    id: "retinol_2_9x16", label: "Retinol 2 – 9×16",
    baseImage: path.join(BASES, "retinol_base_2_9x16.jpg"),
    outSuffix: "retinol2", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0,0,0), DARK = rgb(40,40,40);
      const TEXT_LEFT=40, TEXT_RIGHT=490, TEXT_TOP=200, TEXT_BOTTOM=1540;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      let y = TEXT_TOP;
      const combinedHl = combine(headline, subheadline);
      if (combinedHl) {
        const fit = autoFitSize(ctx, combinedHl, FONT.bold700, 40, 18, 1, MAX_W, 280, () => 4);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, y, fontStr(FONT.bold700, fit.size), { fill: BLACK, spacing: fit.spacing });
        y += fit.blockHeight + 40;
      }
      if (body) {
        const availableH = TEXT_BOTTOM - y;
        const fit = autoFitSize(ctx, body, FONT.regular, 36, 14, 1, MAX_W, availableH, () => 8);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, y, fontStr(FONT.regular, fit.size), { fill: DARK, spacing: fit.spacing });
      }
    },
  },
  {
    id: "retinol_3_9x16", label: "Retinol 3 – 9×16",
    baseImage: path.join(BASES, "retinol_base_3_9x16.jpg"),
    outSuffix: "retinol3", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline }) {
      const WHITE = rgb(255,255,255);
      const CENTER_X = 540, MAX_W = 1020, Y_HEADLINE = 232;
      let y = Y_HEADLINE;
      if (headline) {
        const font = fontStr(FONT.serifBold, 66);
        const lines = wrapText(ctx, headline, font, MAX_W);
        drawMultilineText(ctx, lines, CENTER_X, y, font, { fill: WHITE, spacing: 13, align: "center" });
        y += multilineHeight(ctx, lines, font, 13) + 30;
      }
      if (subheadline) {
        const font = fontStr(FONT.serifBold, 52);
        const lines = wrapText(ctx, subheadline, font, MAX_W);
        drawMultilineText(ctx, lines, CENTER_X, y, font, { fill: WHITE, spacing: 12, align: "center" });
      }
    },
  },
  {
    id: "retinol_4_9x16", label: "Retinol 4 – 9×16",
    baseImage: path.join(BASES, "retinol_base_4_9x16.jpg"),
    outSuffix: "retinol4", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0,0,0), WHITE = rgb(255,255,255), DARK = rgb(30,30,30);
      const IMG_W = 1080;
      const combinedHl = combine(headline, subheadline);
      const hlFont = fontStr(FONT.bold700, 44);
      const hlLines = wrapText(ctx, combinedHl, hlFont, 750);
      drawHighlightedLinesInk(ctx, hlLines, hlFont, { imgW: IMG_W, yTop: 110, padX: 18, padY: 14, radius: 14, lineSpacing: 10, boxColor: BLACK, textColor: WHITE });
      if (body) {
        const GREY_TOP=1060, GREY_BOT=1536, TEXT_LEFT=50, MAX_W_B=980;
        const greyH = GREY_BOT - GREY_TOP;
        const fit = autoFitSize(ctx, body, FONT.bold700, 46, 14, 1, MAX_W_B, greyH, () => 10);
        const boldFont = fontStr(FONT.bold700, fit.size);
        ctx.font = boldFont;
        const mRef = ctx.measureText("Ag");
        const inkAsc = mRef.actualBoundingBoxAscent || 0;
        const fontOverhead = (mRef.fontBoundingBoxAscent || 0) - inkAsc;
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, GREY_TOP - fontOverhead, boldFont, { fill: DARK, spacing: fit.spacing });
      }
    },
  },
  {
    id: "retinol_5_9x16", label: "Retinol 5 – 9×16",
    baseImage: path.join(BASES, "retinol_base_5_9x16.jpg"),
    outSuffix: "retinol5", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20,20,20);
      const GREY_TOP=1040, GREY_BOT=1536, TEXT_LEFT=55, MAX_W=970;
      const greyPad = 30;
      const greyH = GREY_BOT - GREY_TOP - 2 * greyPad;
      const combined = combine(headline, subheadline);
      const fit = autoFitSize(ctx, combined, FONT.bold700, 62, 20, 1, MAX_W, greyH, () => 8);
      const boldFont5 = fontStr(FONT.bold700, fit.size);
      ctx.font = boldFont5;
      const m5 = ctx.measureText("Ag");
      const inkAsc5 = m5.actualBoundingBoxAscent || 0;
      const inkLh5 = inkAsc5 + (m5.actualBoundingBoxDescent || 0);
      const inkBlockH5 = inkLh5 * fit.lines.length + fit.spacing * (fit.lines.length - 1);
      const fontOverhead5 = (m5.fontBoundingBoxAscent || 0) - inkAsc5;
      const greyMid = (GREY_TOP + GREY_BOT) / 2;
      const textY = greyMid - inkBlockH5 / 2 - 40 - fontOverhead5;
      drawMultilineText(ctx, fit.lines, TEXT_LEFT, textY, boldFont5, { fill: DARK, spacing: fit.spacing });
    },
  },
  {
    id: "retinol_6_9x16", label: "Retinol 6 – 9×16",
    baseImage: path.join(BASES, "retinol_base_6_9x16.jpg"),
    outSuffix: "retinol6", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20,20,20);
      const GREY_TOP=1070, GREY_BOT=1510, TEXT_LEFT=60, MAX_W=960;
      const greyPad = 30, vertShift = 40;
      const greyH = GREY_BOT - GREY_TOP - 2 * greyPad;
      const combined = combine(headline, subheadline);
      const fit = autoFitSize(ctx, combined, FONT.bold700, 62, 20, 1, MAX_W, greyH, () => 8);
      const boldFont6 = fontStr(FONT.bold700, fit.size);
      ctx.font = boldFont6;
      const m6 = ctx.measureText("Ag");
      const inkAsc6 = m6.actualBoundingBoxAscent || 0;
      const inkLh6 = inkAsc6 + (m6.actualBoundingBoxDescent || 0);
      const inkBlockH6 = inkLh6 * fit.lines.length + fit.spacing * (fit.lines.length - 1);
      const fontOverhead6 = (m6.fontBoundingBoxAscent || 0) - inkAsc6;
      const greyMid6 = (GREY_TOP + GREY_BOT) / 2;
      const textY = greyMid6 - inkBlockH6 / 2 + vertShift - fontOverhead6;
      drawMultilineText(ctx, fit.lines, TEXT_LEFT, textY, boldFont6, { fill: DARK, spacing: fit.spacing });
    },
  },
  {
    id: "retinol_7_9x16", label: "Retinol 7 – 9×16",
    baseImage: path.join(BASES, "retinol_base_7_9x16.jpg"),
    outSuffix: "retinol7", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline }) {
      const BLACK = rgb(0,0,0), WHITE = rgb(255,255,255);
      const IMG_W = 1080;
      const combined = combine(headline, subheadline);
      const font = fontStr(FONT.bold700, 59);
      const lines = wrapText(ctx, combined, font, 951);
      drawHighlightedLinesInk(ctx, lines, font, { imgW: IMG_W, yTop: 142, padX: 18, padY: 14, radius: 16, lineSpacing: 25, boxColor: BLACK, textColor: WHITE });
    },
  },
  {
    id: "retinol_8_9x16", label: "Retinol 8 – 9×16",
    baseImage: path.join(BASES, "retinol_base_8_9x16.jpg"),
    outSuffix: "retinol8", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline }) {
      const WHITE = rgb(255,255,255);
      const TEXT_LEFT=58, MAX_W=963, TEXT_Y_START=1289, TEXT_BOTTOM=1836, LINE_SPACING=25;
      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);
      let size = 51, lines: Segment[][] = [];
      for (size = 51; size >= 20; size--) {
        const regFont = fontStr(FONT.regular, size), boldFont = fontStr(FONT.bold700, size);
        lines = layoutSegments(ctx, segments, regFont, boldFont, MAX_W);
        const totalH = lines.reduce((a,l) => a + segmentLineInkMetrics(ctx,l,regFont,boldFont).height, 0) + LINE_SPACING*(lines.length-1);
        if (totalH <= TEXT_BOTTOM - TEXT_Y_START) break;
      }
      const regFont = fontStr(FONT.regular, size), boldFont = fontStr(FONT.bold700, size);
      let y = TEXT_Y_START;
      for (const line of lines) {
        const { height: h, ascent } = segmentLineInkMetrics(ctx, line, regFont, boldFont);
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, WHITE, ascent);
        y += h + LINE_SPACING;
      }
    },
  },
  {
    id: "retinol_9_9x16", label: "Retinol 9 – 9×16",
    baseImage: path.join(BASES, "retinol_base_9_9x16.jpg"),
    outSuffix: "retinol9", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20,20,20);
      const BOX_TOP=1155, BOX_BOT=1440;
      const PAD_X=55*1080/1142, PAD_Y=75;
      const TEXT_LEFT=Math.round(92*1080/1142 + PAD_X);
      const TEXT_RIGHT=Math.round(1087*1080/1142 - PAD_X);
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      const LINE_SPACING = 14;
      const AVAIL_H = (BOX_BOT - PAD_Y) - (BOX_TOP + PAD_Y);
      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);
      let size = 46, lines: Segment[][] = [];
      for (size = 46; size >= 20; size--) {
        const regFont = fontStr(FONT.regular, size), boldFont = fontStr(FONT.bold700, size);
        lines = layoutSegments(ctx, segments, regFont, boldFont, MAX_W);
        const { height: refLh } = inkMeasureStr(ctx, "Ag", boldFont);
        const totalH = refLh * lines.length + LINE_SPACING * (lines.length - 1);
        if (totalH <= AVAIL_H) break;
      }
      const boldFont = fontStr(FONT.bold700, size), regFont = fontStr(FONT.regular, size);
      const { height: fixedLh, ascent: fixedAsc } = inkMeasureStr(ctx, "Ag", boldFont);
      const totalH = fixedLh * lines.length + LINE_SPACING * (lines.length - 1);
      const boxMid = (BOX_TOP + BOX_BOT) / 2;
      let y = boxMid - totalH / 2 - 4;
      for (const line of lines) {
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, DARK, fixedAsc);
        y += fixedLh + LINE_SPACING;
      }
    },
  },
  {
    id: "retinol_10_9x16", label: "Retinol 10 – 9×16",
    baseImage: path.join(BASES, "retinol_base_10_9x16.jpg"),
    outSuffix: "retinol10", width: 1080, height: 1920,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(15,15,15), WHITE = rgb(255,255,255);
      const IMG_W = 1080, HEADLINE_SIZE = 51, LINE_SPACING = 46, PAD_Y = 32;
      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);
      const regFont = fontStr(FONT.regular, HEADLINE_SIZE), boldFont = fontStr(FONT.bold700, HEADLINE_SIZE);
      const lines = layoutSegments(ctx, segments, regFont, boldFont, 980);
      const metrics = lines.map((line) => ({ w: segmentLineWidth(ctx,line,regFont,boldFont), ...segmentLineInkMetrics(ctx,line,regFont,boldFont) }));
      let y = 125;
      for (const { w, height } of metrics) {
        ctx.beginPath(); ctx.roundRect(IMG_W/2-w/2-18, y-PAD_Y, w+36, height+PAD_Y*2, 14);
        ctx.fillStyle = WHITE; ctx.fill(); y += height + LINE_SPACING;
      }
      y = 125;
      for (let i = 0; i < lines.length; i++) {
        const { w, height, ascent } = metrics[i];
        drawSegmentLine(ctx, lines[i], IMG_W/2-w/2, y, regFont, boldFont, DARK, ascent);
        y += height + LINE_SPACING;
      }
    },
  },

  // ── 1080×1080 format variants ─────────────────────────────────────────────

  {
    id: "retinol_1_1080x1080", label: "Retinol 1 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_1_1080x1080.jpg"),
    outSuffix: "retinol1", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0,0,0), DARK = rgb(40,40,40);
      const CARD_LEFT=305, CARD_RIGHT=755, CARD_TOP=200, CARD_BOTTOM=800;
      const MAX_W = CARD_RIGHT - CARD_LEFT;
      let y = CARD_TOP;
      const combinedHl = combine(headline, subheadline);
      if (combinedHl) {
        const fit = autoFitSize(ctx, combinedHl, FONT.bold700, 38, 16, 1, MAX_W, 210, () => 4);
        drawMultilineText(ctx, fit.lines, CARD_LEFT, y, fontStr(FONT.bold700, fit.size), { fill: BLACK, spacing: fit.spacing });
        y += fit.blockHeight + 20;
      }
      if (body) {
        const availableH = CARD_BOTTOM - y - 10;
        const fit = autoFitSize(ctx, body, FONT.regular, 24, 12, 1, MAX_W, availableH, () => 6);
        drawMultilineText(ctx, fit.lines, CARD_LEFT, y, fontStr(FONT.regular, fit.size), { fill: DARK, spacing: fit.spacing });
      }
    },
  },
  {
    id: "retinol_2_1080x1080", label: "Retinol 2 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_2_1080x1080.jpg"),
    outSuffix: "retinol2", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0,0,0), DARK = rgb(40,40,40);
      const TEXT_LEFT=84, TEXT_RIGHT=446, TEXT_TOP=43, TEXT_BOTTOM=1037;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      let y = TEXT_TOP;
      const combinedHl = combine(headline, subheadline);
      if (combinedHl) {
        const availableHlH = Math.floor((TEXT_BOTTOM - TEXT_TOP) / 2);
        const fit = autoFitSize(ctx, combinedHl, FONT.bold700, 30, 20, 1, MAX_W, availableHlH, () => 10);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, y, fontStr(FONT.bold700, fit.size), { fill: BLACK, spacing: fit.spacing });
        y += fit.blockHeight + 40;
      }
      if (body) {
        const availableH = TEXT_BOTTOM - y;
        const fit = autoFitSize(ctx, body, FONT.regular, 27, 10, 1, MAX_W, availableH, () => 8);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, y, fontStr(FONT.regular, fit.size), { fill: DARK, spacing: fit.spacing });
      }
    },
  },
  {
    id: "retinol_3_1080x1080", label: "Retinol 3 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_3_1080x1080.jpg"),
    outSuffix: "retinol3", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline }) {
      const WHITE = rgb(255,255,255);
      const CENTER_X = 540, MAX_W = 1000, Y_HEADLINE = 120;
      let y = Y_HEADLINE;
      if (headline) {
        const font = fontStr(FONT.serifBold, 48);
        const lines = wrapText(ctx, headline, font, MAX_W);
        drawMultilineText(ctx, lines, CENTER_X, y, font, { fill: WHITE, spacing: 9, align: "center" });
        y += multilineHeight(ctx, lines, font, 9) + 37;
      }
      if (subheadline) {
        const font = fontStr(FONT.serifBold, 36);
        const lines = wrapText(ctx, subheadline, font, MAX_W);
        drawMultilineText(ctx, lines, CENTER_X, y, font, { fill: WHITE, spacing: 12, align: "center" });
      }
    },
  },
  {
    id: "retinol_4_1080x1080", label: "Retinol 4 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_4_1080x1080.jpg"),
    outSuffix: "retinol4", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline, body }) {
      const BLACK = rgb(0,0,0), WHITE = rgb(255,255,255), DARK = rgb(30,30,30);
      const IMG_W = 1080;
      const combinedHl = combine(headline, subheadline);
      const hlFont = fontStr(FONT.bold700, 36);
      const hlLines = wrapText(ctx, combinedHl, hlFont, 750);
      drawHighlightedLinesInk(ctx, hlLines, hlFont, { imgW: IMG_W, yTop: 90, padX: 18, padY: 14, radius: 14, lineSpacing: 10, boxColor: BLACK, textColor: WHITE });
      if (body) {
        const GREY_TOP=750, GREY_BOT=1080, TEXT_LEFT=50, MAX_W_B=980, greyPad=25;
        const greyH = GREY_BOT - GREY_TOP - 2 * greyPad;
        const fit = autoFitSize(ctx, body, FONT.bold700, 36, 14, 1, MAX_W_B, greyH, () => 10);
        const boldFont = fontStr(FONT.bold700, fit.size);
        const { height: inkLh, ascent: inkAsc } = inkMeasureStr(ctx, "Ag", boldFont);
        const inkBlockH = inkLh * fit.lines.length + fit.spacing * (fit.lines.length - 1);
        ctx.font = boldFont; const fBBAsc = ctx.measureText("Ag").fontBoundingBoxAscent || 0;
        const greyMid = (GREY_TOP + GREY_BOT) / 2;
        const textY = greyMid - inkBlockH / 2 - 28 - (fBBAsc - inkAsc);
        drawMultilineText(ctx, fit.lines, TEXT_LEFT, textY, boldFont, { fill: DARK, spacing: fit.spacing });
      }
    },
  },
  {
    id: "retinol_5_1080x1080", label: "Retinol 5 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_5_1080x1080.jpg"),
    outSuffix: "retinol5", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20,20,20);
      const GREY_TOP=750, GREY_BOT=1080, TEXT_LEFT=55, MAX_W=970, greyPad=30;
      const greyH = GREY_BOT - GREY_TOP - 2 * greyPad;
      const combined = combine(headline, subheadline);
      const fit = autoFitSize(ctx, combined, FONT.bold700, 62, 20, 1, MAX_W, greyH, () => 8);
      const greyMid = (GREY_TOP + GREY_BOT) / 2;
      const textY = greyMid - fit.blockHeight / 2 - 18;
      drawMultilineText(ctx, fit.lines, TEXT_LEFT, textY, fontStr(FONT.bold700, fit.size), { fill: DARK, spacing: fit.spacing });
    },
  },
  {
    id: "retinol_6_1080x1080", label: "Retinol 6 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_6_1080x1080.jpg"),
    outSuffix: "retinol6", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20,20,20);
      const GREY_TOP=710, GREY_BOT=1080, TEXT_LEFT=60, MAX_W=960, greyPad=30, vertShift=-18;
      const greyH = GREY_BOT - GREY_TOP - 2 * greyPad;
      const combined = combine(headline, subheadline);
      const fit = autoFitSize(ctx, combined, FONT.bold700, 54, 20, 1, MAX_W, greyH, () => 8);
      const greyMid = (GREY_TOP + GREY_BOT) / 2;
      const textY = greyMid - fit.blockHeight / 2 + vertShift;
      drawMultilineText(ctx, fit.lines, TEXT_LEFT, textY, fontStr(FONT.bold700, fit.size), { fill: DARK, spacing: fit.spacing });
    },
  },
  {
    id: "retinol_7_1080x1080", label: "Retinol 7 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_7_1080x1080.jpg"),
    outSuffix: "retinol7", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline }) {
      const BLACK = rgb(0,0,0), WHITE = rgb(255,255,255);
      const IMG_W = 1080, MAX_TEXT_BOT = 405;
      const combined = combine(headline, subheadline);
      const yTop = 80;
      let font = fontStr(FONT.bold700, 59);
      let lines = wrapText(ctx, combined, font, 951);
      for (let size = 59; size >= 18; size--) {
        font = fontStr(FONT.bold700, size);
        lines = wrapText(ctx, combined, font, 951);
        const inkMetrics = lines.map(l => inkMeasureStr(ctx, l, font).height);
        const totalH = inkMetrics.reduce((a,h)=>a+h,0) + 18*(lines.length-1);
        if (yTop + totalH <= MAX_TEXT_BOT) break;
      }
      drawHighlightedLinesInk(ctx, lines, font, { imgW: IMG_W, yTop, padX: 18, padY: 14, radius: 16, lineSpacing: 18, boxColor: BLACK, textColor: WHITE });
    },
  },
  {
    id: "retinol_8_1080x1080", label: "Retinol 8 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_8_1080x1080.jpg"),
    outSuffix: "retinol8", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline }) {
      const WHITE = rgb(255,255,255);
      const TEXT_LEFT=59, MAX_W=962, TEXT_Y_START=726, TEXT_BOTTOM=1034, LINE_SPACING=14;
      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);
      let size = 52, lines: Segment[][] = [];
      for (size = 52; size >= 20; size--) {
        const regFont = fontStr(FONT.regular, size), boldFont = fontStr(FONT.bold700, size);
        lines = layoutSegments(ctx, segments, regFont, boldFont, MAX_W);
        const totalH = lines.reduce((a,l)=>a+segmentLineInkMetrics(ctx,l,regFont,boldFont).height,0) + LINE_SPACING*(lines.length-1);
        if (totalH <= TEXT_BOTTOM - TEXT_Y_START) break;
      }
      const regFont = fontStr(FONT.regular, size), boldFont = fontStr(FONT.bold700, size);
      let y = TEXT_Y_START;
      for (const line of lines) {
        const { height: h, ascent } = segmentLineInkMetrics(ctx, line, regFont, boldFont);
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, WHITE, ascent);
        y += h + LINE_SPACING;
      }
    },
  },
  {
    id: "retinol_9_1080x1080", label: "Retinol 9 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_9_1080x1080.jpg"),
    outSuffix: "retinol9", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(20,20,20);
      const sx = 1080/1142, sy = 1080/1144;
      const BOX_TOP = Math.round(649*sy), BOX_BOT = Math.round(949*sy);
      const PAD_X = Math.round(55*sx), PAD_Y9 = Math.round(45*sy);
      const TEXT_LEFT = Math.round(92*sx) + PAD_X;
      const MAX_W = Math.round(1087*sx) - PAD_X - TEXT_LEFT;
      const LINE_SPACING = 14;
      const AVAIL_H = (BOX_BOT - PAD_Y9) - (BOX_TOP + PAD_Y9);
      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);
      let size = 46, lines: Segment[][] = [];
      for (size = 46; size >= 20; size--) {
        const regFont = fontStr(FONT.regular, size), boldFont = fontStr(FONT.bold700, size);
        lines = layoutSegments(ctx, segments, regFont, boldFont, MAX_W);
        const { height: refLh } = inkMeasureStr(ctx, "Ag", boldFont);
        const totalH = refLh * lines.length + LINE_SPACING * (lines.length - 1);
        if (totalH <= AVAIL_H) break;
      }
      const boldFont = fontStr(FONT.bold700, size), regFont = fontStr(FONT.regular, size);
      const { height: fixedLh, ascent: fixedAsc } = inkMeasureStr(ctx, "Ag", boldFont);
      const totalH = fixedLh * lines.length + LINE_SPACING * (lines.length - 1);
      const boxMid = (BOX_TOP + BOX_BOT) / 2;
      let y = boxMid - totalH / 2 - 4;
      for (const line of lines) {
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, DARK, fixedAsc);
        y += fixedLh + LINE_SPACING;
      }
    },
  },
  {
    id: "retinol_10_1080x1080", label: "Retinol 10 – 1080×1080",
    baseImage: path.join(BASES, "retinol_base_10_1080x1080.jpg"),
    outSuffix: "retinol10", width: 1080, height: 1080,
    render(ctx, canvas, { headline, subheadline }) {
      const DARK = rgb(15,15,15), WHITE = rgb(255,255,255);
      const IMG_W = 1080, sx = 1080/838;
      const HEADLINE_SIZE = Math.round(40*sx);
      const LINE_SPACING = Math.round(20*sx);
      const PAD_Y = Math.round(14*sx);
      const combined = combine(headline, subheadline);
      if (!combined) return;
      const segments = parseSegments(combined);
      const regFont = fontStr(FONT.regular, HEADLINE_SIZE), boldFont = fontStr(FONT.bold700, HEADLINE_SIZE);
      const lines = layoutSegments(ctx, segments, regFont, boldFont, Math.round(760*sx));
      const metrics = lines.map((line) => ({ w: segmentLineWidth(ctx,line,regFont,boldFont), ...segmentLineInkMetrics(ctx,line,regFont,boldFont) }));
      let y = Math.round(55*sx);
      for (const { w, height } of metrics) {
        ctx.beginPath(); ctx.roundRect(IMG_W/2-w/2-18, y-PAD_Y, w+36, height+PAD_Y*2, 14);
        ctx.fillStyle = WHITE; ctx.fill(); y += height + LINE_SPACING;
      }
      y = Math.round(55*sx);
      for (let i = 0; i < lines.length; i++) {
        const { w, height, ascent } = metrics[i];
        drawSegmentLine(ctx, lines[i], IMG_W/2-w/2, y, regFont, boldFont, DARK, ascent);
        y += height + LINE_SPACING;
      }
    },
  },
];
