import { describe, expect, it } from "vitest";

import {
  declutterBasemap,
  STREET_LABEL_COLOR,
  type DeclutterMap,
} from "./basemap-declutter";

function fakeMap(layers: { id: string; type: string }[]) {
  const layout = new Map<string, unknown>();
  const paint = new Map<string, unknown>();
  let writes = 0;
  const map: DeclutterMap = {
    getStyle: () => ({ layers }),
    getLayoutProperty: (id, name) => layout.get(`${id}.${name}`),
    setLayoutProperty: (id, name, value) => {
      writes += 1;
      layout.set(`${id}.${name}`, value);
    },
    getPaintProperty: (id, name) => paint.get(`${id}.${name}`),
    setPaintProperty: (id, name, value) => {
      writes += 1;
      paint.set(`${id}.${name}`, value);
    },
  };
  return { map, layout, paint, writes: () => writes };
}

const LAYERS = [
  { id: "building", type: "fill" },
  { id: "highway-name-minor", type: "symbol" },
  { id: "highway-name-path", type: "symbol" },
  { id: "label_city", type: "symbol" },
  { id: "campus-buildings-label", type: "symbol" },
  { id: "map-zones-label", type: "symbol" },
  { id: "venue-pills-symbol", type: "symbol" },
];

describe("declutterBasemap", () => {
  it("hides place, POI and building labels but keeps street names", () => {
    const { map, layout, paint } = fakeMap(LAYERS);
    declutterBasemap(map);
    expect(layout.get("label_city.visibility")).toBe("none");
    expect(layout.get("highway-name-path.visibility")).toBe("none");
    expect(layout.get("campus-buildings-label.visibility")).toBe("none");
    expect(layout.get("highway-name-minor.visibility")).toBeUndefined();
    expect(paint.get("highway-name-minor.text-color")).toBe(STREET_LABEL_COLOR);
  });

  it("never touches TuEats' own symbol layers or non-symbol layers", () => {
    const { map, layout } = fakeMap(LAYERS);
    declutterBasemap(map);
    expect(layout.get("map-zones-label.visibility")).toBeUndefined();
    expect(layout.get("venue-pills-symbol.visibility")).toBeUndefined();
    expect(layout.get("building.visibility")).toBeUndefined();
  });

  it("writes nothing on a second pass, so styledata can't loop", () => {
    const fake = fakeMap(LAYERS);
    declutterBasemap(fake.map);
    const first = fake.writes();
    declutterBasemap(fake.map);
    expect(fake.writes()).toBe(first);
  });
});
