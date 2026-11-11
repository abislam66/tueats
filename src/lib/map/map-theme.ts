import { MAP_STYLE_URL } from "@/config/site";
import type { Theme } from "@/lib/theme";

const DARK_STYLE_URL =
  process.env.NEXT_PUBLIC_MAP_STYLE_URL_DARK ??
  "https://tiles.openfreemap.org/styles/dark";

export function mapStyleUrl(theme: Theme): string {
  return theme === "dark" ? DARK_STYLE_URL : MAP_STYLE_URL;
}

// OpenFreeMap's dark style is neutral grey; these pull it onto the app's
// warm plum palette (land #20121A, water #1A0E11, roads #3A242B).
const LAND = "#20121A";
const WATER = "#1A0E11";
const ROAD = "#3A242B";
const BUILDING = "#2A1820";

type PaintMap = {
  getLayer: (id: string) => unknown;
  setPaintProperty: (id: string, name: string, value: unknown) => unknown;
};

const PAINTS: [string, string, string][] = [
  ["background", "background-color", LAND],
  ["water", "fill-color", WATER],
  ["waterway", "line-color", WATER],
  ["landuse_residential", "fill-color", LAND],
  ["landuse_park", "fill-color", "#26151D"],
  ["landcover_wood", "fill-color", "#26151D"],
  ["building", "fill-color", BUILDING],
  ["building", "fill-outline-color", ROAD],
  ["highway_path", "line-color", ROAD],
  ["highway_minor", "line-color", ROAD],
  ["highway_major_casing", "line-color", ROAD],
  ["highway_major_inner", "line-color", ROAD],
  ["highway_major_subtle", "line-color", ROAD],
  ["highway_motorway_casing", "line-color", ROAD],
  ["highway_motorway_subtle", "line-color", ROAD],
  ["highway_motorway_inner", "line-color", "#4A3039"],
  ["railway", "line-color", "#2E1B23"],
  ["railway_minor", "line-color", "#2E1B23"],
  ["railway_transit", "line-color", "#2E1B23"],
];

export function applyDarkBasemap(map: PaintMap): void {
  for (const [id, prop, value] of PAINTS) {
    if (map.getLayer(id)) map.setPaintProperty(id, prop, value);
  }
}
