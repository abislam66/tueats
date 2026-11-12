export type ViewportBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

/** Whether a point is inside the map's visible box. */
export function inViewport(
  bounds: ViewportBounds,
  point: { lat: number; lng: number },
): boolean {
  return (
    point.lng >= bounds.west &&
    point.lng <= bounds.east &&
    point.lat >= bounds.south &&
    point.lat <= bounds.north
  );
}
