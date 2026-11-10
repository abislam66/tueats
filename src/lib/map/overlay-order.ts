/**
 * Paint order among TuEats overlays, bottom → top. Every id here is
 * added *above* the Positron basemap (including road names). Later
 * layers cover earlier ones — OSM labels must never sit on our fills,
 * plates, or pins.
 *
 * Layer ids must match the components that create them.
 */
export const OVERLAY_PAINT_ORDER = [
  "campus-buildings-fill",
  "campus-buildings-outline",
  "campus-buildings-label",
  "map-zones-hit",
  "campus-dining-symbol",
  "map-zones-label",
  "venue-dots-symbol",
  "venue-pills-symbol",
] as const;

export type OverlayLayerId = (typeof OVERLAY_PAINT_ORDER)[number];

type OverlayLookup = {
  getLayer: (id: string) => unknown;
};

type OverlayStack = OverlayLookup & {
  moveLayer: (id: string, beforeId?: string) => unknown;
};

/**
 * Insert `layerId` before the next overlay that already exists, so a
 * remount keeps the stack. `undefined` appends (top of the map).
 */
export function beforeIdFor(
  map: OverlayLookup,
  layerId: OverlayLayerId,
): string | undefined {
  const index = OVERLAY_PAINT_ORDER.indexOf(layerId);
  if (index === -1) return undefined;
  for (const id of OVERLAY_PAINT_ORDER.slice(index + 1)) {
    if (map.getLayer(id)) return id;
  }
  return undefined;
}

/**
 * Move every mounted overlay to the top of the style, in stack order.
 * Guarantees Positron road names (and any other basemap symbols) stay
 * underneath buildings, zones, dining pins, and venue pills — even if a
 * remount inserted a layer in the middle of the basemap by accident.
 */
export function liftOverlaysAboveBasemap(map: OverlayStack): void {
  for (const id of OVERLAY_PAINT_ORDER) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}
