import { SKRSContext2D, loadImage, Canvas, createCanvas } from "@napi-rs/canvas";
import path from "path";
import {
  FONT,
  autoFitSize,
  drawMultilineText,
  drawSingleText,
  drawStar,
  fontStr,
  lineHeight,
  rgb,
  textWidth,
  wrapText,
} from "../canvas-helpers";

export type TestimonialInput = {
  headline: string;
  quote: string;
  name: string;
  source: "trustpilot" | "video" | "meta" | "other";
};

export type TestimonialTemplate = {
  id: string;
  label: string;
  baseImage: string;
  needsHeadline: boolean;
  requiresTrustpilot?: boolean;
  outSuffix: string;
  render: (ctx: SKRSContext2D, canvas: Canvas, input: TestimonialInput) => void;
};

const BASES = path.join(process.cwd(), "assets", "bases");

function drawImageBase(canvas: Canvas, ctx: SKRSContext2D) {
  // background already drawn by caller before render() is invoked
}

export const testimonialTemplates: TestimonialTemplate[] = [
  {
    id: "template1",
    label: "Template 1",
    baseImage: path.join(BASES, "template_base_1.jpg"),
    needsHeadline: false,
    outSuffix: "template1",
    render(ctx, canvas, { quote, name }) {
      const DARK = rgb(20, 20, 20);
      // Y_TEXT matches the top of the "KJELDGAARD" logo wordmark (measured
      // directly from the photo: y=112), so the quote text lines up with it
      // instead of starting above it.
      const X_TEXT = 95,
        Y_TEXT = 112,
        MAX_W = 690,
        Y_MAX = 660,
        NAME_SIZE = 52;

      const nameFont = fontStr(FONT.bold, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const availableH = Y_MAX - Y_TEXT - nameH - 55;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        72,
        28,
        2,
        MAX_W,
        availableH,
        (size) => Math.max(10, Math.floor(size / 5))
      );
      const font = fontStr(FONT.bold, fit.size);
      const sw = fit.size >= 50 ? 2 : fit.size >= 36 ? 1 : 0;

      drawMultilineText(ctx, fit.lines, X_TEXT, Y_TEXT, font, {
        fill: DARK,
        spacing: fit.spacing,
        strokeWidth: sw,
        strokeColor: DARK,
      });

      const yName = Y_TEXT + fit.blockHeight + 55;
      drawSingleText(ctx, name, X_TEXT, yName, nameFont, {
        fill: DARK,
        strokeWidth: 1,
        strokeColor: DARK,
      });
    },
  },
  {
    id: "template2",
    label: "Template 2",
    baseImage: path.join(BASES, "template_base_2.jpg"),
    needsHeadline: true,
    outSuffix: "template2",
    render(ctx, canvas, { headline, quote, name }) {
      const WHITE = rgb(255, 255, 255);
      const TEAL_DARK = rgb(20, 77, 86);
      const TEAL_LIGHT = rgb(106, 156, 181);

      const CARD_PAD = 68;
      const CARD_LEFT = 199 + CARD_PAD;
      const CARD_RIGHT = 700 - CARD_PAD;
      const CARD_TEXT_TOP = 970;
      const CARD_BOTTOM = 1454 - 80;
      const MAX_W = CARD_RIGHT - CARD_LEFT;
      const NAME_SIZE = 33;

      // Kept narrow enough that headline text wraps before it reaches the
      // pipette graphic (which sits roughly at x=950-1150 near the top of the
      // photo), and height-capped to stop before the decorative blue quote
      // mark, which starts around y=630 — well above CARD_TEXT_TOP, which only
      // marks where the quote text sits inside the card's own padding.
      const MAX_W_HEADLINE = 700;
      const CARD_GRAPHIC_TOP = 620;
      const headlineFit = autoFitSize(
        ctx,
        headline,
        FONT.bold,
        82,
        24,
        2,
        MAX_W_HEADLINE,
        CARD_GRAPHIC_TOP - 290 - 20,
        () => 6
      );
      const headlineFont = fontStr(FONT.bold, headlineFit.size);
      drawMultilineText(ctx, headlineFit.lines, 199, 290, headlineFont, {
        fill: WHITE,
        spacing: 6,
        strokeWidth: 2,
        strokeColor: WHITE,
      });

      const nameFont = fontStr(FONT.regular, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const availableH = CARD_BOTTOM - CARD_TEXT_TOP - nameH - 40;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.regular,
        48,
        22,
        1,
        MAX_W,
        availableH,
        (size) => Math.max(8, Math.floor(size / 4))
      );
      const quoteFont = fontStr(FONT.regular, fit.size);

      drawMultilineText(ctx, fit.lines, CARD_LEFT, CARD_TEXT_TOP, quoteFont, {
        fill: TEAL_DARK,
        spacing: fit.spacing,
      });

      const yName = CARD_TEXT_TOP + fit.blockHeight + 30;
      drawSingleText(ctx, name, CARD_LEFT, yName, nameFont, { fill: TEAL_LIGHT });
    },
  },
  {
    id: "template3",
    label: "Template 3",
    baseImage: path.join(BASES, "template_base_3.jpg"),
    needsHeadline: false,
    outSuffix: "template3",
    render(ctx, canvas, { quote, name }) {
      const TEAL_DARK = rgb(20, 77, 86);
      const TEAL_LIGHT = rgb(75, 141, 165);

      // CARD_LEFT matches the left edge of the baked-in star row (measured
      // directly from the photo: x=705), so the quote text lines up with the
      // stars above it instead of sitting slightly further left.
      const CARD_LEFT = 705;
      const CARD_RIGHT = 1336 - 55;
      // The star row's own bottom edge is at y=1092 (also measured directly);
      // CARD_TEXT_TOP leaves a clear gap below it instead of crowding it.
      const STARS_BOTTOM = 1092;
      const CARD_TEXT_TOP = STARS_BOTTOM + 45;
      const BOTTOM_PAD = 75;
      const CARD_BOTTOM = 1509 - BOTTOM_PAD;
      const NAME_SIZE = 36;
      const MAX_W = CARD_RIGHT - CARD_LEFT;

      const nameFont = fontStr(FONT.bold, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      // Name always sits at this same fixed spot near the card's bottom edge,
      // regardless of how long the quote is — it does not float based on
      // where the quote text happens to end.
      const yName = CARD_BOTTOM - nameH;
      const availableH = yName - 20 - CARD_TEXT_TOP;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        68,
        24,
        1,
        MAX_W,
        availableH,
        (size) => Math.max(8, Math.floor(size / 4))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);
      const sw = fit.size >= 48 ? 2 : fit.size >= 34 ? 1 : 0;

      drawMultilineText(ctx, fit.lines, CARD_LEFT, CARD_TEXT_TOP, quoteFont, {
        fill: TEAL_DARK,
        spacing: fit.spacing,
        strokeWidth: sw,
        strokeColor: TEAL_DARK,
      });

      drawSingleText(ctx, name, CARD_LEFT, yName, nameFont, {
        fill: TEAL_LIGHT,
        strokeWidth: 1,
        strokeColor: TEAL_LIGHT,
      });
    },
  },
  {
    id: "template4",
    label: "Template 4",
    baseImage: path.join(BASES, "template_base_4.jpg"),
    needsHeadline: false,
    outSuffix: "template4",
    render(ctx, canvas, { quote, name }) {
      const WHITE = rgb(255, 255, 255);
      const GOLD = rgb(241, 169, 0);
      const X_TEXT = 158,
        Y_TEXT = 295,
        MAX_W = 530,
        Y_MAX = 900,
        NAME_SIZE = 38;
      const STAR_R = 22,
        STAR_GAP = 54,
        NUM_STARS = 5;

      const nameFont = fontStr(FONT.bold, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const starRowH = STAR_R * 2;
      const availableH = Y_MAX - Y_TEXT - starRowH - 35 - nameH - 25;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        62,
        30,
        2,
        MAX_W,
        availableH,
        (size) => Math.max(10, Math.floor(size / 4))
      );
      const font = fontStr(FONT.bold, fit.size);
      const sw = fit.size >= 48 ? 2 : fit.size >= 34 ? 1 : 0;

      drawMultilineText(ctx, fit.lines, X_TEXT, Y_TEXT, font, {
        fill: WHITE,
        spacing: fit.spacing,
        strokeWidth: sw,
        strokeColor: WHITE,
      });

      const yStars = Y_TEXT + fit.blockHeight + 38;
      for (let i = 0; i < NUM_STARS; i++) {
        const cx = X_TEXT + i * STAR_GAP + STAR_R;
        const cy = yStars + STAR_R;
        drawStar(ctx, cx, cy, STAR_R, STAR_R / 2, GOLD);
      }

      const yName = yStars + starRowH + 20;
      drawSingleText(ctx, name, X_TEXT, yName, nameFont, {
        fill: WHITE,
        strokeWidth: 1,
        strokeColor: WHITE,
      });
    },
  },
  {
    id: "template5",
    label: "Template 5",
    baseImage: path.join(BASES, "template_base_5.jpg"),
    needsHeadline: true,
    outSuffix: "template5",
    render(ctx, canvas, { headline, quote, name }) {
      const WHITE = rgb(255, 255, 255);
      const GOLD = rgb(241, 169, 0);
      const X_TEXT = 75,
        Y_HEADLINE = 120,
        MAX_W = 560;
      const STAR_R = 24,
        STAR_GAP = 54,
        NUM_STARS = 5,
        NAME_SIZE = 52;

      const headlineFit = autoFitSize(
        ctx,
        headline,
        FONT.bold,
        88,
        32,
        2,
        MAX_W,
        450,
        () => 12
      );
      const headlineFont = fontStr(FONT.bold, headlineFit.size);
      drawMultilineText(ctx, headlineFit.lines, X_TEXT, Y_HEADLINE, headlineFont, {
        fill: WHITE,
        spacing: 12,
        strokeWidth: 3,
        strokeColor: WHITE,
      });
      const yQuote = Y_HEADLINE + headlineFit.blockHeight + 130;

      const nameFont = fontStr(FONT.bold, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const starRowH = STAR_R * 2;
      const yBottom = canvas.height - 150;
      const availableH = yBottom - yQuote - starRowH - 100 - nameH;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        62,
        28,
        2,
        MAX_W,
        availableH,
        (size) => Math.max(14, Math.floor(size / 3))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);

      drawMultilineText(ctx, fit.lines, X_TEXT, yQuote, quoteFont, {
        fill: WHITE,
        spacing: fit.spacing,
        strokeWidth: 2,
        strokeColor: WHITE,
      });

      const yName = yQuote + fit.blockHeight + 100;
      drawSingleText(ctx, name, X_TEXT, yName, nameFont, {
        fill: WHITE,
        strokeWidth: 2,
        strokeColor: WHITE,
      });
      const nameW = textWidth(ctx, name, nameFont);

      const xStars = X_TEXT + nameW + 18;
      for (let i = 0; i < NUM_STARS; i++) {
        const cx = xStars + i * STAR_GAP + STAR_R;
        const cy = yName + nameH / 2;
        drawStar(ctx, cx, cy, STAR_R, STAR_R / 2, GOLD);
      }
    },
  },
  {
    id: "template6",
    label: "Template 6",
    baseImage: path.join(BASES, "template_base_6.jpg"),
    needsHeadline: false,
    outSuffix: "template6",
    render(ctx, canvas, { quote, name }) {
      const DARK = rgb(20, 77, 86);
      const TEAL_NAME = rgb(4, 115, 142);
      const CARD_LEFT = 164,
        CARD_RIGHT = 471;
      const MAX_W = CARD_RIGHT - CARD_LEFT;
      const Y_QUOTE = 510,
        NAME_SIZE = 26,
        CARD_BOTTOM = 875;

      const nameFont = fontStr(FONT.regular, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const availableH = CARD_BOTTOM - Y_QUOTE - 30 - nameH;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        62,
        22,
        1,
        MAX_W,
        availableH,
        (size) => Math.max(10, Math.floor(size / 3))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);

      drawMultilineText(ctx, fit.lines, CARD_LEFT, Y_QUOTE, quoteFont, {
        fill: DARK,
        spacing: fit.spacing,
      });

      const yName = Y_QUOTE + fit.blockHeight + 30;
      drawSingleText(ctx, name, CARD_LEFT, yName, nameFont, { fill: TEAL_NAME });
    },
  },
  {
    id: "template7",
    label: "Template 7",
    baseImage: path.join(BASES, "template_base_7.jpg"),
    needsHeadline: false,
    outSuffix: "template7",
    render(ctx, canvas, { quote, name }) {
      const DARK = rgb(3, 29, 42);
      const TEXT_LEFT = 510,
        TEXT_RIGHT = 930,
        TEXT_CENTER = 673;
      const MAX_W = TEXT_RIGHT - TEXT_LEFT;
      const Y_QUOTE = 370,
        NAME_SIZE = 26,
        Y_BOTTOM = 720;

      const nameFont = fontStr(FONT.regular, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const availableH = Y_BOTTOM - Y_QUOTE - 40 - nameH;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        36,
        18,
        1,
        MAX_W,
        availableH,
        (size) => Math.max(10, Math.floor(size / 3))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);

      drawMultilineText(ctx, fit.lines, TEXT_CENTER, Y_QUOTE, quoteFont, {
        fill: DARK,
        spacing: fit.spacing,
        align: "center",
        strokeWidth: 1,
        strokeColor: DARK,
      });

      const yName = Y_QUOTE + fit.blockHeight + 40;
      drawSingleText(ctx, name, TEXT_CENTER, yName, nameFont, {
        fill: DARK,
        align: "center",
      });
    },
  },
  {
    id: "template8",
    label: "Template 8",
    baseImage: path.join(BASES, "template_base_8.jpg"),
    needsHeadline: false,
    outSuffix: "template8",
    render(ctx, canvas, { quote, name }) {
      const WHITE = rgb(255, 255, 255);
      // TEXT_CENTER is pinned to the baked-in quote-mark/stars graphic's own
      // horizontal center (measured directly from the photo: x=663), not
      // derived from the text box — text must stay centered under that
      // graphic regardless of how wide the box is.
      const TEXT_CENTER = 663;
      // The dropper stays left of x=340 until about y=650, then the bottle
      // itself appears and reaches up to about x=560 by y=700-900 (measured
      // directly from the photo). Widened from the original 345px box, but
      // capped well short of that bottle intrusion and cut off before y=650
      // so it never reaches down into the bottle at all.
      const MAX_W = 480;
      const Y_QUOTE = 320,
        NAME_SIZE = 30,
        Y_BOTTOM = 640;

      const nameFont = fontStr(FONT.regular, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const availableH = Y_BOTTOM - Y_QUOTE - 50 - nameH;

      // Floor raised from 16 to 24 so long quotes stay legible instead of
      // shrinking down to near-illegible text.
      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        56,
        24,
        1,
        MAX_W,
        availableH,
        (size) => Math.max(10, Math.floor(size / 3))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);
      // A stroke on already-bold text at small sizes just muddies it further —
      // only add it once the text is large enough for the stroke to read as
      // "bolder" rather than "blurrier".
      const quoteStroke = fit.size >= 30 ? 1 : 0;

      drawMultilineText(ctx, fit.lines, TEXT_CENTER, Y_QUOTE, quoteFont, {
        fill: WHITE,
        spacing: fit.spacing,
        align: "center",
        strokeWidth: quoteStroke,
        strokeColor: WHITE,
      });

      const yName = Y_QUOTE + fit.blockHeight + 50;
      drawSingleText(ctx, name, TEXT_CENTER, yName, nameFont, {
        fill: WHITE,
        align: "center",
        strokeWidth: 1,
        strokeColor: WHITE,
      });
    },
  },
  {
    id: "template9",
    label: "Template 9",
    baseImage: path.join(BASES, "template_base_9.jpg"),
    needsHeadline: false,
    outSuffix: "template9",
    render(ctx, canvas, { quote, name }) {
      const DARK = rgb(3, 29, 42);
      const SIDE_PAD = 50;
      const CARD_LEFT = 136;
      const CARD_RIGHT = 542 - SIDE_PAD;
      const MAX_W = CARD_RIGHT - CARD_LEFT;
      const CARD_BOTTOM = 800 - SIDE_PAD;
      const Y_STARS_END = 217;
      const NAME_SIZE = 28,
        NAME_GAP = 35;

      const nameFont = fontStr(FONT.bold, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const yQuote = Y_STARS_END + 25;
      const availableH = CARD_BOTTOM - yQuote - NAME_GAP - nameH;

      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        42,
        20,
        1,
        MAX_W,
        availableH,
        (size) => Math.max(10, Math.floor(size / 3))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);
      const yName = CARD_BOTTOM - nameH;

      drawMultilineText(ctx, fit.lines, CARD_LEFT, yQuote, quoteFont, {
        fill: DARK,
        spacing: fit.spacing,
        strokeWidth: 1,
        strokeColor: DARK,
      });
      drawSingleText(ctx, name, CARD_LEFT, yName, nameFont, {
        fill: DARK,
        strokeWidth: 1,
        strokeColor: DARK,
      });
    },
  },
  {
    id: "template10",
    label: "Template 10",
    baseImage: path.join(BASES, "template_base_10.jpg"),
    needsHeadline: true,
    outSuffix: "template10",
    render(ctx, canvas, { headline, quote, name }) {
      const DARK = rgb(0, 0, 0);
      // X_TEXT matches the left edge of the "KJELDGAARD" wordmark in the logo
      // (measured directly from the photo). MAX_W_QUOTE is capped so the quote
      // column's right edge stays clear of the bottle, whose glass body reaches
      // as far left as x=476 (also measured directly from the photo).
      const X_TEXT = 127,
        MAX_W_HEADLINE = 880,
        MAX_W_QUOTE = 330;
      const Y_HEADLINE = 60,
        HEADLINE_SIZE = 80,
        NAME_SIZE = 28;

      const headlineFit = autoFitSize(
        ctx,
        headline,
        FONT.bold,
        HEADLINE_SIZE,
        32,
        2,
        MAX_W_HEADLINE,
        400,
        () => 18
      );
      const headlineFont = fontStr(FONT.bold, headlineFit.size);
      drawMultilineText(ctx, headlineFit.lines, X_TEXT, Y_HEADLINE, headlineFont, {
        fill: DARK,
        spacing: 18,
        strokeWidth: 1,
        strokeColor: DARK,
      });
      const yAfterHeadline = Y_HEADLINE + headlineFit.blockHeight + 40;

      const nameFont = fontStr(FONT.bold, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const NAME_GAP = 40;
      const Y_BOTTOM = 1127;
      const availableH = Y_BOTTOM - yAfterHeadline - NAME_GAP - nameH;

      // Floor raised from 20 to 26 so long quotes stay legible instead of
      // shrinking down to near-illegible text in this narrow column.
      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        36,
        26,
        1,
        MAX_W_QUOTE,
        availableH,
        (size) => Math.max(12, Math.floor(size / 3))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);
      // A stroke on already-bold text at small sizes just muddies it further —
      // only add it once the text is large enough for the stroke to read as
      // "bolder" rather than "blurrier".
      const quoteStroke = fit.size >= 30 ? 1 : 0;

      drawMultilineText(ctx, fit.lines, X_TEXT, yAfterHeadline, quoteFont, {
        fill: DARK,
        spacing: fit.spacing,
        strokeWidth: quoteStroke,
        strokeColor: DARK,
      });

      const yName = yAfterHeadline + fit.blockHeight + NAME_GAP;
      drawSingleText(ctx, name, X_TEXT, yName, nameFont, { fill: DARK });
    },
  },
  {
    id: "tp_stars",
    label: "Trustpilot Stars",
    baseImage: path.join(BASES, "template_base_tp_stars.jpg"),
    needsHeadline: false,
    requiresTrustpilot: true,
    outSuffix: "tp_stars",
    render(ctx, canvas, { quote, name }) {
      const DARK = rgb(3, 29, 42);
      // TEXT_CENTER matches the Trustpilot logo/stars row above it (measured
      // directly from the photo). The bottle's dropper stays left of x=440
      // until about y=750, then the bottle body widens out to about x=540
      // from y=850 down (also measured directly) — Y_BOTTOM is kept well
      // above that so the text block never reaches down into the bottle.
      const TEXT_CENTER = 730;
      const MAX_W = 500;
      const Y_QUOTE = 440,
        NAME_SIZE = 28,
        Y_BOTTOM = 800;

      const nameFont = fontStr(FONT.regular, NAME_SIZE);
      const nameH = lineHeight(ctx, name, nameFont);
      const availableH = Y_BOTTOM - Y_QUOTE - 40 - nameH;

      // Floor raised from 18 to 22 so long quotes stay legible instead of
      // shrinking down to near-illegible text.
      const fit = autoFitSize(
        ctx,
        quote,
        FONT.bold,
        40,
        22,
        1,
        MAX_W,
        availableH,
        (size) => Math.max(10, Math.floor(size / 3))
      );
      const quoteFont = fontStr(FONT.bold, fit.size);
      // A stroke on already-bold text at small sizes just muddies it further —
      // only add it once the text is large enough for the stroke to read as
      // "bolder" rather than "blurrier".
      const quoteStroke = fit.size >= 28 ? 1 : 0;

      drawMultilineText(ctx, fit.lines, TEXT_CENTER, Y_QUOTE, quoteFont, {
        fill: DARK,
        spacing: fit.spacing,
        align: "center",
        strokeWidth: quoteStroke,
        strokeColor: DARK,
      });

      const yName = Y_QUOTE + fit.blockHeight + 55;
      drawSingleText(ctx, name, TEXT_CENTER, yName, nameFont, {
        fill: DARK,
        align: "center",
      });
    },
  },
];

/** template1 and template3 resize the base image before drawing (ported from the
 * `img = img.resize((W, H), LANCZOS)` calls in those two Python scripts). */
export const RESIZE_OVERRIDES: Record<string, [number, number]> = {
  template1: [1636, 1630],
  template3: [1408, 1608],
};
