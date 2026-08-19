import { SKRSContext2D, Canvas } from "@napi-rs/canvas";
import path from "path";
import { FONT, fontStr, lineHeight, rgb, textWidth, wrapText } from "../canvas-helpers";

export type MortenInput = { text: string };

export type MortenTemplate = {
  id: string;
  label: string;
  baseImage: string;
  outSuffix: string;
  render: (ctx: SKRSContext2D, canvas: Canvas, input: MortenInput) => void;
};

const BASES = path.join(process.cwd(), "assets", "bases");

function autoFitLines(
  ctx: SKRSContext2D,
  text: string,
  maxSize: number,
  minSize: number,
  step: number,
  maxWidth: number,
  fitHeight: (lines: string[], lineHeights: number[]) => boolean
) {
  let lines: string[] = [];
  let size = maxSize;
  let heights: number[] = [];
  for (size = maxSize; size >= minSize; size -= step) {
    const font = fontStr(FONT.bold700, size);
    lines = wrapText(ctx, text, font, maxWidth);
    heights = lines.map((l) => lineHeight(ctx, l, font));
    if (fitHeight(lines, heights)) break;
  }
  return { size, lines, heights };
}

/** Group A: per-line box, horizontally centered on x_center, each box sized to its own line. */
function renderCenteredBoxes(
  ctx: SKRSContext2D,
  canvas: Canvas,
  text: string,
  opts: {
    maxSize: number;
    minSize: number;
    xMargin: number;
    rightMargin?: number;
    padX: number;
    padTop: number;
    padBottom: number;
    yBottom: number;
    yTopMax: number;
    boxColor: string;
    textColor: string;
    radius?: number;
  }
) {
  const { width } = canvas;
  const xCenter = width / 2;
  const maxW = width - opts.xMargin - (opts.rightMargin ?? opts.xMargin);

  const { size, lines, heights } = autoFitLines(
    ctx,
    text,
    opts.maxSize,
    opts.minSize,
    2,
    maxW - 2 * opts.padX,
    (_, hs) => {
      const totalH = hs.reduce((a, h) => a + h + opts.padTop + opts.padBottom, 0);
      return totalH <= opts.yBottom - opts.yTopMax;
    }
  );
  const font = fontStr(FONT.bold700, size);
  const totalH = heights.reduce((a, h) => a + h + opts.padTop + opts.padBottom, 0);

  let y = opts.yBottom - totalH;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineW = textWidth(ctx, line, font);
    const lineH = heights[i];
    // Round to whole pixels so adjacent boxes share an identical edge instead
    // of leaving an anti-aliasing seam (see renderBlockLeftBoxes for detail).
    const boxLeft = Math.round(xCenter - lineW / 2 - opts.padX);
    const boxRight = Math.round(xCenter + lineW / 2 + opts.padX);
    const boxTop = Math.round(y);
    const boxBot = Math.round(y + lineH + opts.padTop + opts.padBottom);

    ctx.fillStyle = opts.boxColor;
    if (opts.radius) {
      ctx.beginPath();
      ctx.roundRect(boxLeft, boxTop, boxRight - boxLeft, boxBot - boxTop, opts.radius);
      ctx.fill();
    } else {
      ctx.fillRect(boxLeft, boxTop, boxRight - boxLeft, boxBot - boxTop);
    }

    ctx.font = font;
    ctx.fillStyle = opts.textColor;
    ctx.fillText(line, xCenter, boxTop + opts.padTop);
    y = boxBot;
  }
}

/** Group B: one shared left edge for the whole block (block treated as centered as a
 * unit), each line's box grows to the right based on that line's own width. */
function renderBlockLeftBoxes(
  ctx: SKRSContext2D,
  canvas: Canvas,
  text: string,
  opts: {
    maxSize: number;
    minSize: number;
    xMargin: number;
    rightMargin: number;
    padX: number;
    padTop: number;
    padBottom: number;
    yBottom: number;
    yTopMax: number;
    boxColor: string;
    textColor: string;
  }
) {
  const { width } = canvas;
  const maxW = width - opts.xMargin - opts.rightMargin;

  const { size, lines, heights } = autoFitLines(
    ctx,
    text,
    opts.maxSize,
    opts.minSize,
    2,
    maxW - 2 * opts.padX,
    (_, hs) => {
      const totalH = hs.reduce((a, h) => a + h + opts.padTop + opts.padBottom, 0);
      return totalH <= opts.yBottom - opts.yTopMax;
    }
  );
  const font = fontStr(FONT.bold700, size);
  const totalH = heights.reduce((a, h) => a + h + opts.padTop + opts.padBottom, 0);

  const lineWidths = lines.map((l) => textWidth(ctx, l, font));
  const blockW = Math.max(...lineWidths);
  const xLeft = (width - blockW) / 2;

  let y = opts.yBottom - totalH;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  for (let i = 0; i < lines.length; i++) {
    const lineW = lineWidths[i];
    const lineH = heights[i];
    // Round to whole pixels so this box's bottom edge and the next box's top
    // edge land on the exact same pixel row — otherwise two separately
    // anti-aliased rectangles sharing a fractional-pixel edge leave a hairline
    // gap where the photo behind them peeks through.
    const boxLeft = Math.round(xLeft - opts.padX);
    const boxRight = Math.round(xLeft + lineW + opts.padX);
    const boxTop = Math.round(y);
    const boxBot = Math.round(y + lineH + opts.padTop + opts.padBottom);

    ctx.fillStyle = opts.boxColor;
    ctx.fillRect(boxLeft, boxTop, boxRight - boxLeft, boxBot - boxTop);

    ctx.font = font;
    ctx.fillStyle = opts.textColor;
    ctx.fillText(lines[i], xLeft, boxTop + opts.padTop);
    y = boxBot;
  }
}

export const mortenTemplates: MortenTemplate[] = [
  {
    id: "morten_1",
    label: "Morten 1",
    baseImage: path.join(BASES, "morten_base_1.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      renderCenteredBoxes(ctx, canvas, text, {
        maxSize: 72,
        minSize: 30,
        xMargin: 40,
        padX: 20,
        padTop: 18,
        padBottom: 10,
        yBottom: 1310,
        yTopMax: 930,
        boxColor: rgb(0, 0, 0),
        textColor: rgb(255, 255, 255),
      });
    },
  },
  {
    id: "morten_2",
    label: "Morten 2",
    baseImage: path.join(BASES, "morten_base_2.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      renderBlockLeftBoxes(ctx, canvas, text, {
        maxSize: 56,
        minSize: 20,
        xMargin: 60,
        rightMargin: 130,
        padX: 20,
        padTop: 18,
        padBottom: 10,
        yBottom: 1290,
        yTopMax: 1070,
        boxColor: rgb(0, 0, 0),
        textColor: rgb(255, 255, 255),
      });
    },
  },
  {
    id: "morten_3",
    label: "Morten 3",
    baseImage: path.join(BASES, "morten_base_3.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      renderBlockLeftBoxes(ctx, canvas, text, {
        maxSize: 56,
        minSize: 20,
        xMargin: 55,
        rightMargin: 130,
        padX: 24,
        padTop: 20,
        padBottom: 12,
        yBottom: 1550,
        yTopMax: 1050,
        boxColor: rgb(254, 209, 30),
        textColor: rgb(0, 0, 0),
      });
    },
  },
  {
    id: "morten_4",
    label: "Morten 4",
    baseImage: path.join(BASES, "morten_base_4.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      const X_MARGIN = 55,
        RIGHT_MARGIN = 55;
      const LINE_GAP = 24;
      const TOP_GAP = 30,
        BOTTOM_GAP = 30;
      const YELLOW_TOP = 1175,
        YELLOW_BOTTOM = 1570;
      const { width } = canvas;
      const maxW = width - X_MARGIN - RIGHT_MARGIN;

      const { size, lines, heights } = autoFitLines(ctx, text, 90, 20, 2, maxW, (_, hs) => {
        const totalH = hs.reduce((a, h) => a + h, 0) + LINE_GAP * (hs.length - 1);
        return totalH <= YELLOW_BOTTOM - YELLOW_TOP - TOP_GAP - BOTTOM_GAP;
      });
      const font = fontStr(FONT.bold700, size);
      const totalH = heights.reduce((a, h) => a + h, 0) + LINE_GAP * (heights.length - 1);

      const leftover = YELLOW_BOTTOM - YELLOW_TOP - totalH;
      let y = YELLOW_TOP + leftover * 0.75;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = font;
      ctx.fillStyle = rgb(0, 0, 0);
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], X_MARGIN, y);
        y += heights[i] + LINE_GAP;
      }
    },
  },
  {
    id: "morten_5",
    label: "Morten 5",
    baseImage: path.join(BASES, "morten_base_5.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      renderBlockLeftBoxes(ctx, canvas, text, {
        maxSize: 40,
        minSize: 16,
        xMargin: 30,
        rightMargin: 30,
        padX: 22,
        padTop: 12,
        padBottom: 7,
        yBottom: 1100,
        yTopMax: 800,
        boxColor: rgb(30, 72, 255),
        textColor: rgb(255, 255, 255),
      });
    },
  },
  {
    id: "morten_6",
    label: "Morten 6",
    baseImage: path.join(BASES, "morten_base_6.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      renderBlockLeftBoxes(ctx, canvas, text, {
        maxSize: 44,
        minSize: 16,
        xMargin: 50,
        rightMargin: 110,
        padX: 17,
        padTop: 15,
        padBottom: 8,
        yBottom: 1095,
        yTopMax: 910,
        boxColor: rgb(0, 0, 0),
        textColor: rgb(255, 255, 255),
      });
    },
  },
  {
    id: "morten_7",
    label: "Morten 7",
    baseImage: path.join(BASES, "morten_base_7.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      const X_MARGIN = 50,
        LINE_GAP = 12,
        STROKE = 7;
      const Y_BOTTOM = 1650,
        Y_TOP_MAX = 1230;
      const { width } = canvas;
      const xCenter = width / 2;
      const maxW = width - 2 * X_MARGIN;

      let size = 20,
        lines: string[] = [],
        heights: number[] = [];
      for (size = 72; size >= 20; size -= 2) {
        const font = fontStr(FONT.bold700, size);
        lines = wrapText(ctx, text, font, maxW - 2 * STROKE);
        heights = lines.map((l) => lineHeight(ctx, l, font));
        const totalH = heights.reduce((a, h) => a + h, 0) + LINE_GAP * (heights.length - 1);
        if (totalH <= Y_BOTTOM - Y_TOP_MAX) break;
      }
      const font = fontStr(FONT.bold700, size);
      const totalH = heights.reduce((a, h) => a + h, 0) + LINE_GAP * (heights.length - 1);
      let y = Y_BOTTOM - totalH;

      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = font;
      ctx.lineJoin = "round";
      for (let i = 0; i < lines.length; i++) {
        ctx.lineWidth = STROKE * 2;
        ctx.strokeStyle = rgb(0, 0, 0);
        ctx.strokeText(lines[i], xCenter, y);
        ctx.fillStyle = rgb(255, 255, 255);
        ctx.fillText(lines[i], xCenter, y);
        y += heights[i] + LINE_GAP;
      }
    },
  },
  {
    id: "morten_8",
    label: "Morten 8",
    baseImage: path.join(BASES, "morten_base_8.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      renderCenteredBoxes(ctx, canvas, text, {
        maxSize: 60,
        minSize: 22,
        xMargin: 30,
        rightMargin: 30,
        padX: 20,
        padTop: 16,
        padBottom: 10,
        yBottom: 1390,
        yTopMax: 1150,
        boxColor: rgb(0, 0, 0),
        textColor: rgb(255, 255, 255),
        radius: 22,
      });
    },
  },
  {
    id: "morten_9",
    label: "Morten 9",
    baseImage: path.join(BASES, "morten_base_9.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      const X_MARGIN = 45,
        RIGHT_MARGIN = 45,
        LINE_GAP = 18;
      const YELLOW_TOP = 1032,
        YELLOW_BOTTOM = 1370;
      const { width } = canvas;
      const maxW = width - X_MARGIN - RIGHT_MARGIN;

      let size = 18,
        lines: string[] = [],
        heights: number[] = [];
      for (size = 64; size >= 18; size -= 2) {
        const font = fontStr(FONT.bold700, size);
        lines = wrapText(ctx, text, font, maxW);
        heights = lines.map((l) => lineHeight(ctx, l, font));
        const totalH = heights.reduce((a, h) => a + h, 0) + LINE_GAP * (heights.length - 1);
        if (totalH <= YELLOW_BOTTOM - YELLOW_TOP) break;
      }
      const totalH = heights.reduce((a, h) => a + h, 0) + LINE_GAP * (heights.length - 1);
      const leftover = YELLOW_BOTTOM - YELLOW_TOP - totalH;
      let y = YELLOW_TOP + leftover * 0.5;

      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = fontStr(FONT.bold700, size);
      ctx.fillStyle = rgb(0, 0, 0);
      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], X_MARGIN, y);
        y += heights[i] + LINE_GAP;
      }
    },
  },
  {
    id: "morten_10",
    label: "Morten 10",
    baseImage: path.join(BASES, "morten_base_10.jpg"),
    outSuffix: "morten",
    render(ctx, canvas, { text }) {
      renderCenteredBoxes(ctx, canvas, text, {
        maxSize: 48,
        minSize: 18,
        xMargin: 25,
        rightMargin: 25,
        padX: 16,
        padTop: 13,
        padBottom: 8,
        yBottom: 1360,
        yTopMax: 1040,
        boxColor: rgb(0, 0, 0),
        textColor: rgb(255, 255, 255),
        radius: 18,
      });
    },
  },
];
