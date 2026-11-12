import { describe, expect, it } from "vitest";

import { inViewport } from "@/lib/map/viewport";

const box = { west: -75.16, south: 39.98, east: -75.14, north: 39.99 };

describe("inViewport", () => {
  it("includes points inside and on the edge, excludes the rest", () => {
    expect(inViewport(box, { lat: 39.985, lng: -75.15 })).toBe(true);
    expect(inViewport(box, { lat: 39.98, lng: -75.16 })).toBe(true);
    expect(inViewport(box, { lat: 39.97, lng: -75.15 })).toBe(false);
    expect(inViewport(box, { lat: 39.985, lng: -75.13 })).toBe(false);
  });
});
