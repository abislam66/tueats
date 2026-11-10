/**
 * Canvas-drawn name-plate icons for the map's symbol layers — generated at
 * runtime so no binary asset is checked in.
 *
 * Venue plates bake the venue name INTO the sprite (one image per venue ×
 * state). MapLibre draws every `icon-image` in a symbol layer first, then
 * every `text-field`, so a stretchable plate plus live text lets one name
 * bleed through an overlapping plate — baked sprites occlude cleanly
 * instead (same fix as zone-label-icon.ts).
 *
 * Chrome matches the zone labels: square plate, hard ink outline, flat
 * offset shadow, leader-line-and-dot stem. Dining pins share that
 * silhouette at 2/3 size with a white/stone palette.
 *
 * The neutral campus-dining variant keeps the label-free 9-slice path:
 * its three pins never overlap each other, and its text stays a GL
 * `text-field`.
 */

const SCALE = 3; // raster oversample for crisp rendering at typical zoom
const PILL_WIDTH = 64; // dining 9-slice base width
const PILL_HEIGHT = 40; // dining 9-slice plate height
// Cherry venue/cluster plates are sized close to their text so dense
// zones stop feeling congested: a small width floor, and a plate only
// tall enough to seat the 13px label with a little air above and below.
// The dining 9-slice keeps the larger PILL_WIDTH/PILL_HEIGHT above — its
// stretch bands are tuned to those — so only the baked name plates use
// these two.
const VENUE_PILL_MIN_WIDTH = 40;
const VENUE_PILL_HEIGHT = 26;
const STEM_LINE_WIDTH = 2.5;
const STEM_LINE_HEIGHT = 9;
const STEM_DOT_RADIUS = 3;
const BORDER = 1.25;
const SHADOW_OFFSET = 2;
const SHADOW_COLOR = "rgba(23, 19, 16, 0.4)";
// Margin above/beside the plate so the selected halo and shadow aren't
// clipped. No margin below: the stem-dot tip must stay at the bitmap's
// bottom edge — it is the map coordinate (icon-anchor: bottom).
const PAD = 5;
const HALO_WIDTH = 2.5;
const HEIGHT =
  PAD + PILL_HEIGHT + STEM_LINE_HEIGHT + STEM_DOT_RADIUS * 2 + BORDER;
// Same vertical budget as HEIGHT but for the shorter venue plate: the gap
// between the plate's bottom edge and the stem-dot tip is identical, so
// the compact plate sits exactly where the old one did relative to its
// pin coordinate (icon-anchor: "bottom") — only the top of the box moves.
const VENUE_HEIGHT =
  PAD + VENUE_PILL_HEIGHT + STEM_LINE_HEIGHT + STEM_DOT_RADIUS * 2 + BORDER;

const INK = "#171310";
const VENUE_FILL = "#9D2235"; // --color-cherry
const VENUE_HALO = "rgba(157, 34, 53, 0.28)";
const VENUE_TEXT = "#ffffff";

// Drawn at the old z18.5 GL text size; the layer's zoom-scaled
// `icon-size` shrinks the whole sprite at lower zooms.
const LABEL_FONT_SIZE = 13;
// Space between the text and each vertical plate edge. Small and
// comfortable — enough to breathe, not the roomy chip it was.
const LABEL_PAD_X = 11;
// Longest label drawn on a plate (design px); longer names end in "…" so a
// 70-character name can't produce a plate wider than the screen.
const LABEL_MAX_WIDTH = 190;

/** Shortens `text` with an ellipsis until it fits `maxWidth`. */
export function fitLabel(
  measure: (text: string) => number,
  text: string,
  maxWidth: number,
): string {
  if (measure(text) <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && measure(`${text.slice(0, end).trimEnd()}…`) > maxWidth) {
    end -= 1;
  }
  return `${text.slice(0, end).trimEnd()}…`;
}

// Campus-dining info pins: white surface + the campus-building stroke
// stone, so they read as map furniture — never a tappable cherry venue.
const DINING_FILL = "#FFFFFF";
const DINING_STROKE = "#B8B4AA";

type PillStyle = {
  fill: string;
  /** Dashed outline (hours unknown). */
  dashed?: boolean;
  stroke: string;
  borderWidth: number;
  /** Selected-only soft ring outside the border. */
  halo?: string;
  /** Stem line + dot outline. Defaults to the plate's ink outline. */
  stemStroke?: string;
};

export type PillIconAsset = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  pixelRatio: number;
  content: [number, number, number, number];
  stretchX: [number, number][];
  stretchY: [number, number][];
};

export type VenuePillIconAsset = {
  width: number;
  height: number;
  data: Uint8ClampedArray;
  pixelRatio: number;
};

export type VenuePillState = "normal" | "hover" | "selected";

/** Open-status variant baked into the sprite (see getPinStatus). */
export type VenuePillStatus = "open" | "closing" | "closed" | "unknown";

export const DINING_PILL_ICON = "campus-dining-pill";

/**
 * Image id for one venue's baked pill. Includes the name so an admin
 * rename naturally busts the per-map image cache.
 */
export function venuePillIconId(
  venueId: string,
  state: VenuePillState,
  name: string,
  status: VenuePillStatus = "open",
): string {
  return `venue-pill/${status}/${state}/${venueId}/${name}`;
}

/**
 * Image id for a cluster badge — several venues occupying (near-)identical
 * screen space, shown as one "N spots" pill instead of silently stacking.
 * Keyed only by count + state: the label text depends on nothing else, so
 * clusters of the same size reuse one baked sprite regardless of which
 * venues happen to be in them.
 */
export function clusterPillIconId(
  count: number,
  state: VenuePillState,
): string {
  return `cluster-pill/${state}/${count}`;
}

export function clusterPillLabel(count: number): string {
  return `${count} spots`;
}

/** Same baked-pill treatment as a venue, labeled with a spot count. */
export function buildClusterPillIcon(
  count: number,
  state: VenuePillState,
): VenuePillIconAsset {
  return buildVenuePillIcon(clusterPillLabel(count), state);
}

// Existing tokens only: cherry, white surface, canvas, ink-secondary, border.
const CANVAS = "#F5F5F4";
const INK_SECONDARY = "#57534E";
const BORDER_COLOR = "#E7E5E4";

type StatusStyle = {
  fill: string;
  stroke: string;
  text: string;
  border: number;
  dashed?: boolean;
  /** Whole-sprite alpha (closed plates recede). */
  alpha?: number;
  /** Stem colour; defaults to INK. */
  stem?: string;
};

const STATUS_STYLES: Record<VenuePillStatus, StatusStyle> = {
  open: { fill: VENUE_FILL, stroke: INK, text: VENUE_TEXT, border: 1.5 },
  closing: { fill: "#FFFFFF", stroke: VENUE_FILL, text: VENUE_FILL, border: 2 },
  closed: {
    fill: CANVAS,
    stroke: INK_SECONDARY,
    text: INK_SECONDARY,
    border: 1,
    alpha: 0.82,
    stem: INK_SECONDARY,
  },
  unknown: {
    fill: "#FFFFFF",
    stroke: BORDER_COLOR,
    text: INK_SECONDARY,
    border: 1.5,
    dashed: true,
    stem: INK_SECONDARY,
  },
};

function venuePillStyle(
  status: VenuePillStatus,
  state: VenuePillState,
): PillStyle {
  const s = STATUS_STYLES[status];
  // Hover/selected thicken the outline; selected adds the cherry halo.
  // The selected outline is always ink so it reads on every status.
  const active = state !== "normal";
  return {
    fill: s.fill,
    stroke: state === "selected" ? INK : s.stroke,
    borderWidth: active ? Math.max(s.border, 2.25) : s.border,
    dashed: s.dashed && state !== "selected",
    halo: state === "selected" ? VENUE_HALO : undefined,
    stemStroke: s.stem,
  };
}

// Same body-font approach as zone-label-icon.ts, so pill names match the
// page's Satoshi instead of the basemap's Noto.
function labelFont(): string {
  const family =
    typeof document === "undefined"
      ? "sans-serif"
      : getComputedStyle(document.body).fontFamily || "sans-serif";
  return `700 ${LABEL_FONT_SIZE}px ${family}`;
}

/** Paints halo + square plate + leader-line-and-dot stem (`pillWidth`/`pillHeight` in design units). */
function paintPill(
  ctx: CanvasRenderingContext2D,
  pillWidth: number,
  pillHeight: number,
  style: PillStyle,
) {
  const { fill, stroke, borderWidth, halo, dashed, stemStroke = INK } = style;
  const plateX = PAD;
  const plateY = PAD;

  // Selected-only halo — a soft cherry ring outside the ink border so
  // the selected plate reads differently from a merely hovered one.
  if (halo) {
    ctx.beginPath();
    ctx.rect(
      plateX - HALO_WIDTH,
      plateY - HALO_WIDTH,
      pillWidth + HALO_WIDTH * 2,
      pillHeight + HALO_WIDTH * 2,
    );
    ctx.fillStyle = halo;
    ctx.fill();
  }

  // Hard offset shadow — solid, no blur, same pixel-UI treatment as
  // zone labels. Drawn first so the plate and stem sit on top of it.
  ctx.beginPath();
  ctx.rect(
    plateX + SHADOW_OFFSET,
    plateY + SHADOW_OFFSET,
    pillWidth - BORDER,
    pillHeight - BORDER,
  );
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fill();

  // Square plate — fill + ink outline on all sides.
  ctx.beginPath();
  ctx.rect(
    plateX + borderWidth / 2,
    plateY + borderWidth / 2,
    pillWidth - borderWidth,
    pillHeight - borderWidth,
  );
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = borderWidth;
  ctx.strokeStyle = stroke;
  if (dashed) ctx.setLineDash([3, 2]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Stem — thin leader line ending in a small fill-colored dot at the
  // true coordinate (`icon-anchor: "bottom"`), matching zone labels.
  const cx = plateX + pillWidth / 2;
  const stemTopY = plateY + pillHeight;
  const stemBottomY = stemTopY + STEM_LINE_HEIGHT;
  ctx.beginPath();
  ctx.moveTo(cx, stemTopY);
  ctx.lineTo(cx, stemBottomY);
  ctx.lineWidth = STEM_LINE_WIDTH;
  ctx.strokeStyle = stemStroke;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, stemBottomY + STEM_DOT_RADIUS, STEM_DOT_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = BORDER;
  ctx.strokeStyle = stemStroke;
  ctx.stroke();
}

/** One opaque sprite: pill + stem + the venue name, sized to the name. */
export function buildVenuePillIcon(
  name: string,
  state: VenuePillState,
  status: VenuePillStatus = "open",
): VenuePillIconAsset {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  const font = labelFont();
  ctx.font = font;
  const label = fitLabel(
    (text) => ctx.measureText(text).width,
    name,
    LABEL_MAX_WIDTH,
  );
  const textWidth = ctx.measureText(label).width;
  const pillWidth = Math.max(
    VENUE_PILL_MIN_WIDTH,
    Math.ceil(textWidth + LABEL_PAD_X * 2),
  );
  const width = pillWidth + PAD * 2 + SHADOW_OFFSET;

  canvas.width = width * SCALE;
  canvas.height = VENUE_HEIGHT * SCALE;
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.font = font; // canvas resize resets state

  const statusStyle = STATUS_STYLES[status];
  // Closed plates fade, but a selected one returns to full strength.
  ctx.globalAlpha = state === "selected" ? 1 : (statusStyle.alpha ?? 1);
  paintPill(ctx, pillWidth, VENUE_PILL_HEIGHT, venuePillStyle(status, state));

  ctx.fillStyle = statusStyle.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, PAD + pillWidth / 2, PAD + VENUE_PILL_HEIGHT / 2);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return {
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
    pixelRatio: SCALE,
  };
}

// ---------------------------------------------------------------------------
// Label-free 9-slice variant (campus dining) — stretched by icon-text-fit.
// `content`/`stretchX`/`stretchY` are specified in the raw bitmap's own
// pixel space (i.e. WIDTH*SCALE / HEIGHT*SCALE) — NOT the unscaled design
// units used above. Defined here in design units (pill offset by PAD),
// then scaled below.

const NINE_SLICE_WIDTH = PILL_WIDTH + PAD * 2 + SHADOW_OFFSET;

const CONTENT_DESIGN: [number, number, number, number] = [
  16 + PAD,
  9 + PAD,
  48 + PAD,
  31 + PAD,
];
const STRETCH_X_DESIGN: [number, number][] = [
  [16 + PAD, 23 + PAD],
  [41 + PAD, 48 + PAD],
];
const STRETCH_Y_DESIGN: [number, number][] = [[19 + PAD, 21 + PAD]];

const CONTENT = CONTENT_DESIGN.map((v) => v * SCALE) as [
  number,
  number,
  number,
  number,
];
const STRETCH_X = STRETCH_X_DESIGN.map(
  ([a, b]) => [a * SCALE, b * SCALE] as [number, number],
);
const STRETCH_Y = STRETCH_Y_DESIGN.map(
  ([a, b]) => [a * SCALE, b * SCALE] as [number, number],
);

function drawPill(style: PillStyle): PillIconAsset {
  const canvas = document.createElement("canvas");
  canvas.width = NINE_SLICE_WIDTH * SCALE;
  canvas.height = HEIGHT * SCALE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");

  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  paintPill(ctx, PILL_WIDTH, PILL_HEIGHT, style);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  return {
    width: canvas.width,
    height: canvas.height,
    data: imageData.data,
    pixelRatio: SCALE,
    content: CONTENT,
    stretchX: STRETCH_X,
    stretchY: STRETCH_Y,
  };
}

// Dining pins stay visibly smaller than the (now compact) venue plate so
// they keep receding as map furniture: same 9-slice bitmap, registered at
// a higher pixelRatio. The content/stretch bands are in bitmap pixel
// space, so they need no adjustment.
const DINING_PILL_DOWNSCALE = 1.85;

/** Neutral, non-interactive pill for meal-plan dining info pins. */
export function buildDiningPillIcon(): PillIconAsset {
  const asset = drawPill({
    fill: DINING_FILL,
    stroke: DINING_STROKE,
    borderWidth: 1.5,
    stemStroke: INK,
  });
  return { ...asset, pixelRatio: asset.pixelRatio * DINING_PILL_DOWNSCALE };
}
