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
 * Venue plates: 12px/700 label, 4×8 padding, 4px radius, flat offset
 * shadow, leader-line-and-dot stem; names truncate at ~14 characters.
 * Plates that lose a collision (or closed / unknown venues at overview
 * zoom) collapse to 6px status dots; clusters are round count bubbles.
 * Dining pins keep the square silhouette at 2/3 size, white/stone palette.
 *
 * The neutral campus-dining variant keeps the label-free 9-slice path:
 * its three pins never overlap each other, and its text stays a GL
 * `text-field`.
 */

import { currentTheme } from "@/lib/theme";

import { truncateLabel } from "./venue-pin-rules";

const SCALE = 3; // raster oversample for crisp rendering at typical zoom
const PILL_WIDTH = 64; // dining 9-slice base width
const PILL_HEIGHT = 40; // dining 9-slice plate height
// Venue plates hug their text: 12px/700 label, 4px top/bottom and 8px
// side padding, 4px corner radius. The dining 9-slice keeps the larger
// PILL_WIDTH/PILL_HEIGHT above — its stretch bands are tuned to those.
const LABEL_FONT_SIZE = 12;
const LABEL_PAD_X = 8;
const LABEL_PAD_Y = 4;
const PLATE_RADIUS = 4;
const VENUE_PILL_MIN_WIDTH = 28;
const VENUE_PILL_HEIGHT = LABEL_FONT_SIZE + LABEL_PAD_Y * 2;
const STEM_LINE_WIDTH = 2.5;
const STEM_LINE_HEIGHT = 9;
const STEM_DOT_RADIUS = 3;
const BORDER = 1.25;
/** Sprite bottom edge → stem-dot centre (design px), for `icon-offset`. */
export const PLATE_TIP_OFFSET_PX = STEM_DOT_RADIUS + BORDER;
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
const VENUE_HALO = "rgba(157, 34, 53, 0.28)";
const VENUE_TEXT = "#ffffff";

// Status dot (closed / unknown at overview, and every plate that lost a
// collision) and the cluster count bubble.
const DOT_DIAMETER = 6;
const DOT_BORDER = 1;
const BUBBLE_DIAMETER = 22;

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
  /** Plate corner radius (design px). Square when omitted. */
  radius?: number;
};

/** Rounded-rect path (no `ctx.roundRect` dependency). */
function rectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  const rr = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

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
 * Image id for a cluster count bubble — several venues sharing (nearly)
 * the same screen spot, shown as one round "3" instead of stacking.
 * Keyed by count + best member status + state, so equal clusters reuse
 * one sprite regardless of which venues are in them.
 */
export function clusterBubbleIconId(
  count: number,
  status: VenuePillStatus,
  state: VenuePillState,
): string {
  return `cluster-bubble/${status}/${state}/${count}`;
}

/** Image id for a 6px status dot (no name — one per status). */
export function venueDotIconId(status: VenuePillStatus): string {
  return `venue-dot/${status}`;
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

// Open is a cherry plate in light and amber in dark; everything else
// reuses the theme's neutrals. Sprites are baked when the map is built, and
// a theme switch rebuilds the map, so reading the theme here is enough.
const OPEN_LIGHT = "#9D2235"; // cherry: solid plate = open, outlined = closing
const OPEN_DARK = "#F5B642";
const DARK_INK = "#1A0E11";
const DARK_MUTED_LINE = "#8F7880";

function statusStyles(): Record<VenuePillStatus, StatusStyle> {
  if (currentTheme() === "dark") {
    return {
      open: {
        fill: OPEN_DARK,
        stroke: DARK_INK,
        text: DARK_INK,
        border: 1.5,
        stem: OPEN_DARK,
      },
      closing: {
        fill: "#24141A",
        stroke: OPEN_DARK,
        text: OPEN_DARK,
        border: 2,
        stem: OPEN_DARK,
      },
      closed: {
        fill: "#2C1920",
        stroke: DARK_MUTED_LINE,
        text: "#BBA3A9",
        border: 1,
        alpha: 0.9,
        stem: DARK_MUTED_LINE,
      },
      unknown: {
        fill: "#24141A",
        stroke: DARK_MUTED_LINE,
        text: "#BBA3A9",
        border: 1.5,
        dashed: true,
        stem: DARK_MUTED_LINE,
      },
    };
  }
  return {
    open: { fill: OPEN_LIGHT, stroke: INK, text: VENUE_TEXT, border: 1.5 },
    closing: {
      fill: "#FFFFFF",
      stroke: OPEN_LIGHT,
      text: OPEN_LIGHT,
      border: 2,
      stem: OPEN_LIGHT,
    },
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
}

function selectedRing(): { stroke: string; halo: string } {
  return currentTheme() === "dark"
    ? { stroke: "#F6EEF0", halo: "rgba(242, 154, 168, 0.4)" }
    : { stroke: INK, halo: VENUE_HALO };
}

function venuePillStyle(
  status: VenuePillStatus,
  state: VenuePillState,
): PillStyle {
  const s = statusStyles()[status];
  const ring = selectedRing();
  // Hover/selected thicken the outline; selected adds the cherry halo.
  // The selected outline is always ink so it reads on every status.
  const active = state !== "normal";
  return {
    fill: s.fill,
    stroke: state === "selected" ? ring.stroke : s.stroke,
    borderWidth: active ? Math.max(s.border, 2.25) : s.border,
    dashed: s.dashed && state !== "selected",
    halo: state === "selected" ? ring.halo : undefined,
    stemStroke: s.stem,
    radius: PLATE_RADIUS,
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
  const {
    fill,
    stroke,
    borderWidth,
    halo,
    dashed,
    stemStroke = INK,
    radius = 0,
  } = style;
  const plateX = PAD;
  const plateY = PAD;

  // Selected-only halo — a soft cherry ring outside the ink border so
  // the selected plate reads differently from a merely hovered one.
  if (halo) {
    rectPath(
      ctx,
      plateX - HALO_WIDTH,
      plateY - HALO_WIDTH,
      pillWidth + HALO_WIDTH * 2,
      pillHeight + HALO_WIDTH * 2,
      radius + HALO_WIDTH,
    );
    ctx.fillStyle = halo;
    ctx.fill();
  }

  // Hard offset shadow — solid, no blur, same pixel-UI treatment as
  // zone labels. Drawn first so the plate and stem sit on top of it.
  rectPath(
    ctx,
    plateX + SHADOW_OFFSET,
    plateY + SHADOW_OFFSET,
    pillWidth - BORDER,
    pillHeight - BORDER,
    radius,
  );
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fill();

  // Plate — fill + outline on all sides.
  rectPath(
    ctx,
    plateX + borderWidth / 2,
    plateY + borderWidth / 2,
    pillWidth - borderWidth,
    pillHeight - borderWidth,
    radius,
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
  // Plates carry at most ~14 characters; the full name stays in the list,
  // the mini-card and the live-region announcement.
  const label = truncateLabel(name);
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

  const statusStyle = statusStyles()[status];
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

function freshCanvas(sizeDesign: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(sizeDesign * SCALE);
  canvas.height = Math.ceil(sizeDesign * SCALE);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  return { canvas, ctx };
}

function toAsset(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
): VenuePillIconAsset {
  return {
    width: canvas.width,
    height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
    pixelRatio: SCALE,
  };
}

/**
 * 6px status dot, centered on the venue coordinate (`icon-anchor:
 * "center"`). Same fills/outlines as the plates so a dot reads as a
 * collapsed plate of the same state.
 */
export function buildVenueDotIcon(status: VenuePillStatus): VenuePillIconAsset {
  const size = DOT_DIAMETER + DOT_BORDER * 2;
  const { canvas, ctx } = freshCanvas(size);
  const s = statusStyles()[status];
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, DOT_DIAMETER / 2, 0, Math.PI * 2);
  ctx.fillStyle = s.fill;
  ctx.fill();
  ctx.lineWidth = DOT_BORDER;
  // The unknown plate's pale dashed border would vanish at 6px.
  ctx.strokeStyle = status === "unknown" ? (s.stem ?? s.stroke) : s.stroke;
  ctx.stroke();
  return toAsset(canvas, ctx);
}

/** Round count bubble for a cluster ("3"), styled by its best member. */
export function buildClusterBubbleIcon(
  count: number,
  status: VenuePillStatus,
  state: VenuePillState,
): VenuePillIconAsset {
  const label = String(count);
  const font = labelFont();
  const probe = document.createElement("canvas").getContext("2d");
  if (probe) probe.font = font;
  const textWidth = probe ? probe.measureText(label).width : label.length * 7;
  const diameter = Math.max(BUBBLE_DIAMETER, Math.ceil(textWidth + 10));
  const size = diameter + PAD * 2;
  const { canvas, ctx } = freshCanvas(size);
  ctx.font = font;

  const s = statusStyles()[status];
  const active = state !== "normal";
  const c = size / 2;
  ctx.globalAlpha = s.alpha ?? 1;
  ctx.beginPath();
  ctx.arc(
    c + SHADOW_OFFSET / 2,
    c + SHADOW_OFFSET / 2,
    diameter / 2,
    0,
    Math.PI * 2,
  );
  ctx.fillStyle = SHADOW_COLOR;
  ctx.fill();

  const border = active ? Math.max(s.border, 2.25) : s.border;
  ctx.beginPath();
  ctx.arc(c, c, diameter / 2 - border / 2, 0, Math.PI * 2);
  ctx.fillStyle = s.fill;
  ctx.fill();
  ctx.lineWidth = border;
  ctx.strokeStyle = status === "unknown" ? (s.stem ?? s.stroke) : s.stroke;
  ctx.stroke();

  ctx.fillStyle = s.text;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, c, c + 0.5);
  return toAsset(canvas, ctx);
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
