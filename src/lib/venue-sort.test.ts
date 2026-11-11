import { describe, expect, it } from "vitest";

import { getMockVenueBySlug } from "@/lib/venue-fixtures";
import {
  bandFor,
  resolveSort,
  sortVenues,
  type SortedGroup,
} from "@/lib/venue-sort";
import type { Venue } from "@/lib/venues";

const base = getMockVenueBySlug("cherry-cart")!;
const v = (id: string, hours: Venue["hours"]) =>
  ({ ...base, id, slug: id, name: id, hours }) as Venue;

// Monday 2026-11-09, 9:40 PM in campus time (EST).
const NOW = new Date("2026-11-10T02:40:00Z");

const venues = [
  v("ten-fifteen", { mon: [{ open: "11:00", close: "22:15" }] }), // 35 min
  v("eleven", { mon: [{ open: "11:00", close: "23:00" }] }),
  v("midnight", { mon: [{ open: "11:00", close: "00:00" }] }),
  v("two-am", { mon: [{ open: "18:00", close: "02:00" }] }),
  v("four-am", { mon: [{ open: "18:00", close: "04:00" }] }),
  v("closed", { tue: [{ open: "08:00", close: "12:00" }] }),
  v("unknown", null),
];

const ids = (groups: SortedGroup[], key: string) =>
  groups.find((g) => g.key === key)?.items.map((i) => i.venue.id);

describe("sortVenues across midnight (campus time)", () => {
  const earliest = sortVenues(venues, NOW, "earliest", new Map());

  it("bands open venues and orders them earliest to latest", () => {
    expect(earliest.map((g) => g.key)).toEqual([
      "within-hour",
      "tonight",
      "past-midnight",
      "closed",
      "unknown",
    ]);
    expect(ids(earliest, "within-hour")).toEqual(["ten-fifteen"]);
    expect(ids(earliest, "tonight")).toEqual(["eleven", "midnight"]);
    expect(ids(earliest, "past-midnight")).toEqual(["two-am", "four-am"]);
  });

  it("counts a close exactly at midnight as tonight, 2 AM as later than 11 PM", () => {
    expect(bandFor(140, 21 * 60 + 40)).toBe("tonight");
    expect(bandFor(141, 21 * 60 + 40)).toBe("past-midnight");
  });

  it("reverses the bands and the order inside them for latest to earliest", () => {
    const latest = sortVenues(venues, NOW, "latest", new Map());
    expect(latest.map((g) => g.key).slice(0, 3)).toEqual([
      "past-midnight",
      "tonight",
      "within-hour",
    ]);
    expect(ids(latest, "past-midnight")).toEqual(["four-am", "two-am"]);
    expect(ids(latest, "tonight")).toEqual(["midnight", "eleven"]);
  });

  it("always puts unknown hours last, after closed", () => {
    for (const sort of ["earliest", "latest", "nearest"] as const) {
      const groups = sortVenues(venues, NOW, sort, new Map());
      expect(groups.at(-1)?.key).toBe("unknown");
      expect(groups.at(-2)?.key).toBe("closed");
    }
  });

  it("drops closed and unknown venues in the Open now view", () => {
    const groups = sortVenues(venues, NOW, "earliest", new Map(), {
      includeClosed: false,
    });
    const all = groups.flatMap((g) => g.items.map((i) => i.venue.id));
    expect(all).not.toContain("closed");
    expect(all).not.toContain("unknown");
    expect(all).toHaveLength(5);
  });
});

describe("nearest", () => {
  const distances = new Map([
    ["ten-fifteen", 0.5],
    ["eleven", 0.2],
    ["midnight", 0.2],
    ["two-am", 1.1],
    ["four-am", 0.05],
  ]);
  const groups = sortVenues(venues, NOW, "nearest", distances, {
    includeClosed: false,
  });

  it("is one group ordered by distance, then by close time", () => {
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe("nearest");
    expect(groups[0]!.items.map((i) => i.venue.id)).toEqual([
      "four-am",
      "eleven",
      "midnight",
      "ten-fifteen",
      "two-am",
    ]);
  });
});

describe("resolveSort", () => {
  it("never uses nearest without location", () => {
    expect(resolveSort("nearest", false)).toBe("earliest");
    expect(resolveSort("nearest", true)).toBe("nearest");
    expect(resolveSort("latest", false)).toBe("latest");
  });
});
