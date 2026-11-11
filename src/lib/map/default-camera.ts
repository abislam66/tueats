import type { LngLatBoundsLike, Map as MapLibreMap } from "maplibre-gl";

import {
  CAMPUS_BOUNDS,
  CAMPUS_MAX_BOUNDS,
  DEFAULT_VIEWPORT,
} from "@/config/site";

export type CameraMemory = {
  center: [number, number];
  zoom: number;
  /** The visitor moved the map themselves; auto-fitting stays off. */
  userMoved: boolean;
};

export const FIT_VENUE_COUNT = 8;
export const FIT_PADDING_PX = 48;
export const FIT_MIN_ZOOM = 15.5;
export const FIT_MAX_ZOOM = 17;
export const LOCATION_ZOOM = 16.5;

type Point = { lat: number; lng: number };

function insideCampusBounds(point: Point): boolean {
  const [[west, south], [east, north]] = CAMPUS_MAX_BOUNDS;
  return (
    point.lng >= west &&
    point.lng <= east &&
    point.lat >= south &&
    point.lat <= north
  );
}

/**
 * Where the map starts, and re-aims until the visitor takes over: on their
 * location when it's already granted (and on campus), otherwise fitted to
 * the first few open venues, otherwise the campus overview. `inset` is the
 * part of the map covered by UI (the phone's bottom stack, the desktop's
 * list pane) so the venues land in the visible part.
 */
export function fitDefaultCamera(
  map: MapLibreMap,
  venues: Point[],
  location: Point | null,
  inset: { bottom: number; left: number },
  duration: number,
): void {
  const padding = {
    top: FIT_PADDING_PX,
    right: FIT_PADDING_PX,
    bottom: FIT_PADDING_PX + inset.bottom,
    left: FIT_PADDING_PX + inset.left,
  };

  if (!(location && insideCampusBounds(location)) && venues.length === 0) {
    map.fitBounds(
      [
        [CAMPUS_BOUNDS.west, CAMPUS_BOUNDS.south],
        [CAMPUS_BOUNDS.east, CAMPUS_BOUNDS.north],
      ],
      { padding, duration, maxZoom: DEFAULT_VIEWPORT.zoom },
    );
    return;
  }

  // Aim at a point (the visitor) or at the box around the venues. Going
  // through cameraForBounds bakes the covered-by-UI inset into the center,
  // so the map's own padding stays at zero for every later flight.
  const points =
    location && insideCampusBounds(location) ? [location] : venues;
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const bounds: LngLatBoundsLike = [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
  const pointed = points === venues ? FIT_MAX_ZOOM : LOCATION_ZOOM;
  const camera = map.cameraForBounds(bounds, { padding, maxZoom: pointed });
  if (!camera || !camera.center) return;
  const raw = camera.center;
  const center: [number, number] = Array.isArray(raw)
    ? [raw[0], raw[1]]
    : "lng" in raw
      ? [raw.lng, raw.lat]
      : [raw.lon, raw.lat];
  const zoom =
    pointed === LOCATION_ZOOM
      ? LOCATION_ZOOM
      : Math.min(FIT_MAX_ZOOM, Math.max(FIT_MIN_ZOOM, camera.zoom ?? 16));
  map.easeTo({
    center,
    zoom,
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
    duration,
  });
}
