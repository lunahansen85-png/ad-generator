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

function drawSegmentLine(
  ctx: SKRSContext2D,
  line: Segment[],
  startX: number,
  y: number,
  regFont: string,
  boldFont: string,
  color: string
) {
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = color;
  let x = startX;
  for (let i = 0; i < line.length; i++) {
    const seg = line[i];
    const font = seg.bold ? boldFont : regFont;
    ctx.font = font;
    ctx.fillText(seg.word, x, y);
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
      drawHighlightedLines(ctx, lines, font, {
        imgW: IMG_W,
        yTop: 100,
        padX: 18,
        padY: 14,
        radius: 16,
        lineSpacing: 18,
        boxColor: BLACK,
        textColor: WHITE,
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
        const totalH =
          lines.reduce((a, l) => a + segmentLineHeight(ctx, l, regFont, boldFont), 0) +
          LINE_SPACING * (lines.length - 1);
        if (totalH <= TEXT_BOTTOM - TEXT_Y_START) break;
      }

      const regFont = fontStr(FONT.regular, size);
      const boldFont = fontStr(FONT.bold700, size);
      let y = TEXT_Y_START;
      for (const line of lines) {
        const h = segmentLineHeight(ctx, line, regFont, boldFont);
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, WHITE);
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
        const refLh = lineHeight(ctx, "Ag", boldFont);
        const totalH = refLh * lines.length + LINE_SPACING * (lines.length - 1);
        if (totalH <= TEXT_BOTTOM - TEXT_Y) break;
      }

      const boldFont = fontStr(FONT.bold700, size);
      const regFont = fontStr(FONT.regular, size);
      const fixedLh = lineHeight(ctx, "Ag", boldFont);
      const totalH = fixedLh * lines.length + LINE_SPACING * (lines.length - 1);
      const boxMid = (BOX_TOP + BOX_BOTTOM) / 2;
      // Centered directly on our own measured block height — no extra
      // leading offset, since that was tuned for a different rendering
      // engine's specific baseline conventions and doesn't apply here.
      let y = boxMid - totalH / 2;
      for (const line of lines) {
        drawSegmentLine(ctx, line, TEXT_LEFT, y, regFont, boldFont, DARK);
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
        h: segmentLineHeight(ctx, line, regFont, boldFont),
      }));

      let y = 55;
      for (const { w, h } of metrics) {
        const x0 = IMG_W / 2 - w / 2 - 18;
        const x1 = IMG_W / 2 + w / 2 + 18;
        ctx.beginPath();
        ctx.roundRect(x0, y - PAD_Y, x1 - x0, h + PAD_Y * 2, 14);
        ctx.fillStyle = WHITE;
        ctx.fill();
        y += h + LINE_SPACING;
      }

      y = 55;
      for (let i = 0; i < lines.length; i++) {
        const { w, h } = metrics[i];
        const x = IMG_W / 2 - w / 2;
        drawSegmentLine(ctx, lines[i], x, y, regFont, boldFont, DARK);
        y += h + LINE_SPACING;
      }
    },
  },
];
