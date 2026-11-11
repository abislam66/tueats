/**
 * Pure placement rules for venue pins — which venues get a name plate at
 * which zoom, and who wins when plates collide. Kept free of MapLibre and
 * canvas so they are unit-testable.
 */
import type { VenuePillState, VenuePillStatus } from "./venue-pill-icon";

/** Longest plate label, in characters, ellipsis included. */
export const PLATE_LABEL_MAX_CHARS = 14;

/**
 * Below this zoom only open / closing-soon venues get a plate; closed and
 * unknown-hours venues are small dots. At or above it every venue may show
 * a plate (collision permitting).
 */
export const ALL_PLATES_MIN_ZOOM = 16;

/** Below this zoom only open / closing venues show, as at most MAX_OVERVIEW_PINS pins. */
export const OPEN_ONLY_MAX_ZOOM = 15;
export const MAX_OVERVIEW_PINS = 12;

export type PinDensity = "open-only" | "open-plates" | "all-plates";

/**
 * How much the map shows at a zoom:
 * - under 15: open venues only (closed hidden), capped, clusters as bubbles;
 * - 15 to 16: open + closing as plates, closed as small dots;
 * - 16 and up: every venue as a plate, collision demoting losers to dots.
 */
export function pinDensity(zoom: number): PinDensity {
  if (zoom < OPEN_ONLY_MAX_ZOOM) return "open-only";
  if (zoom < ALL_PLATES_MIN_ZOOM) return "open-plates";
  return "all-plates";
}

/** "Maxi's Pizza, Subs and Bar" → "Maxi's Pizza,…" (full name lives elsewhere). */
export function truncateLabel(
  name: string,
  maxChars: number = PLATE_LABEL_MAX_CHARS,
): string {
  const text = name.trim();
  const chars = Array.from(text);
  if (chars.length <= maxChars) return text;
  return `${chars
    .slice(0, maxChars - 1)
    .join("")
    .trimEnd()}…`;
}

/** Whether a venue keeps its plate below `ALL_PLATES_MIN_ZOOM`. */
export function showsPlateAtOverview(
  status: VenuePillStatus,
  state: VenuePillState,
): boolean {
  return state !== "normal" || status === "open" || status === "closing";
}

const STATUS_RANK: Record<VenuePillStatus, number> = {
  open: 2,
  closing: 3,
  closed: 4,
  unknown: 5,
};

/**
 * `symbol-sort-key` for a plate. With collision detection on, MapLibre
 * places LOWER keys first, so they win: selected > hovered > open >
 * closing soon > closed > unknown.
 */
export function pinPriority(
  status: VenuePillStatus,
  state: VenuePillState,
): number {
  if (state === "selected") return 0;
  if (state === "hover") return 1;
  return STATUS_RANK[status];
}

/** Clusters edge out single plates of their best member's status. */
export function clusterPriority(best: VenuePillStatus): number {
  return STATUS_RANK[best] - 0.5;
}

/** The most decision-useful status among a cluster's members. */
export function bestStatus(statuses: VenuePillStatus[]): VenuePillStatus {
  return statuses.reduce<VenuePillStatus>(
    (best, status) => (STATUS_RANK[status] < STATUS_RANK[best] ? status : best),
    "unknown",
  );
}
