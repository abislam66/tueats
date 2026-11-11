/**
 * Strips the Positron basemap down to street names. Building names, POIs,
 * place / water / airport labels and road shields are hidden; the two
 * street-name layers stay, small and muted, so they read as orientation
 * rather than competing with venue plates. The curated campus-building
 * overlay keeps its fills and outlines but loses its text layer.
 *
 * Idempotent and cheap to re-run: call it on every `styledata` event so
 * layers added later (e.g. the campus-building label layer, mounted after
 * its GeoJSON loads) are caught too. It only writes when a value differs,
 * so the `styledata` its own writes fire settles immediately.
 */

/** Basemap symbol layers that survive — street names only. */
export const STREET_LABEL_LAYER_IDS = [
  "highway-name-minor",
  "highway-name-major",
  // The dark style names them differently.
  "highway_name_other",
  "highway_name_motorway",
] as const;

/** TuEats' own symbol layers; never hidden here. */
export const OWN_SYMBOL_LAYER_IDS = [
  "map-zones-label",
  "campus-dining-symbol",
  "venue-dots-symbol",
  "venue-pills-symbol",
] as const;

export const STREET_LABEL_COLOR = "#A8A29E";
export const STREET_LABEL_COLOR_DARK = "#8F7880";
export const STREET_LABEL_SIZE = [
  "interpolate",
  ["linear"],
  ["zoom"],
  14,
  9,
  17,
  10.5,
] as const;

type LayerSummary = { id: string; type: string };

export type DeclutterMap = {
  getStyle: () => { layers?: LayerSummary[] } | undefined;
  getLayoutProperty: (id: string, name: string) => unknown;
  setLayoutProperty: (id: string, name: string, value: unknown) => unknown;
  getPaintProperty: (id: string, name: string) => unknown;
  setPaintProperty: (id: string, name: string, value: unknown) => unknown;
};

const STREET = new Set<string>(STREET_LABEL_LAYER_IDS);
const OWN = new Set<string>(OWN_SYMBOL_LAYER_IDS);

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function setLayout(
  map: DeclutterMap,
  id: string,
  name: string,
  value: unknown,
) {
  if (!same(map.getLayoutProperty(id, name), value)) {
    map.setLayoutProperty(id, name, value);
  }
}

function setPaint(map: DeclutterMap, id: string, name: string, value: unknown) {
  if (!same(map.getPaintProperty(id, name), value)) {
    map.setPaintProperty(id, name, value);
  }
}

export function declutterBasemap(
  map: DeclutterMap,
  theme: "light" | "dark" = "light",
): void {
  const dark = theme === "dark";
  const layers = map.getStyle()?.layers ?? [];
  for (const layer of layers) {
    if (layer.type !== "symbol" || OWN.has(layer.id)) continue;
    if (STREET.has(layer.id)) {
      setLayout(map, layer.id, "text-size", STREET_LABEL_SIZE);
      setPaint(
        map,
        layer.id,
        "text-color",
        dark ? STREET_LABEL_COLOR_DARK : STREET_LABEL_COLOR,
      );
      setPaint(
        map,
        layer.id,
        "text-halo-color",
        dark ? "rgba(26,14,17,0.85)" : "rgba(255,255,255,0.8)",
      );
      setPaint(map, layer.id, "text-halo-width", 1);
      continue;
    }
    setLayout(map, layer.id, "visibility", "none");
  }
}
