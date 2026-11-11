import { describe, expect, it } from "vitest";

import { getMockVenueBySlug } from "@/lib/venue-fixtures";
import {
  groupVenuesByStatus,
  locationPhrase,
  venuePlainLine,
} from "@/lib/venue-groups";
import type { Venue } from "@/lib/venues";

const base = getMockVenueBySlug("cherry-cart")!;
const v = (id: string, hours: Venue["hours"], extra: Partial<Venue> = {}) =>
  ({ ...base, id, slug: id, name: id, hours, ...extra }) as Venue;

// Monday 2026-11-09, 9:40 PM EST.
const NOW = new Date("2026-11-10T02:40:00Z");

describe("groupVenuesByStatus", () => {
  const venues = [
    v("ten", { mon: [{ open: "11:00", close: "23:00" }] }),
    v("four-am", { mon: [{ open: "18:00", close: "04:00" }] }),
    v("midnight", { mon: [{ open: "18:00", close: "00:00" }] }),
    v("soon-b", { mon: [{ open: "12:00", close: "22:30" }] }),
    v("soon-a", { mon: [{ open: "12:00", close: "22:00" }] }),
    v("tomorrow", { tue: [{ open: "08:00", close: "12:00" }] }),
    v("unknown", null),
  ];
  const groups = groupVenuesByStatus(venues, NOW);

  it("orders groups and sorts open-late by latest close, past midnight last", () => {
    expect(groups.map((g) => g.key)).toEqual([
      "open",
      "closing",
      "later",
      "unknown",
    ]);
    expect(groups[0]!.items.map((i) => i.venue.id)).toEqual([
      "four-am",
      "midnight",
      "ten",
    ]);
  });

  it("sorts closing-soon by soonest first with minutes left", () => {
    expect(groups[1]!.items.map((i) => [i.venue.id, i.minutesLeft])).toEqual([
      ["soon-a", 20],
      ["soon-b", 50],
    ]);
  });

  it("tracks next-open day offset for closed venues", () => {
    expect(groups[2]!.items[0]).toMatchObject({
      time: "08:00",
      opensDayOffset: 1,
    });
  });
});

describe("venuePlainLine", () => {
  it("reads as plain words", () => {
    const line = venuePlainLine({
      ...base,
      type: "restaurant",
      cuisines: ["american"],
      isHalal: true,
      building: "Avery",
    });
    expect(line).toBe("American and halal, in Avery");
  });

  it("uses the zone, or just the street, instead of a full address", () => {
    const address = "1422 Cecil B. Moore Ave, Philadelphia, PA 19121";
    const withZone = venuePlainLine({
      ...base,
      type: "restaurant",
      cuisines: ["american"],
      isHalal: false,
      building: address,
      mapZone: "avery",
    });
    expect(withZone).toBe("American, in Avery");
    const noZone = venuePlainLine({
      ...base,
      type: "restaurant",
      cuisines: ["american"],
      isHalal: false,
      building: address,
      mapZone: null,
    });
    expect(noZone).toBe("American, on Cecil B. Moore Ave");
  });

  it("handles a venue with no cuisine, halal flag, building or zone", () => {
    expect(
      venuePlainLine({
        ...base,
        cuisines: [],
        isHalal: false,
        building: null,
        mapZone: null,
      }),
    ).toBe("");
  });
});

describe("locationPhrase", () => {
  const at = (building: string | null, extra: Partial<Venue> = {}) =>
    ({ ...base, type: "restaurant", mapZone: null, building, ...extra }) as Venue;

  it("says 'on' for streets, avenues and walks", () => {
    expect(locationPhrase(at("Cecil B. Moore Ave"))).toBe("on Cecil B. Moore Ave");
    expect(locationPhrase(at("Liacouras Walk"))).toBe("on Liacouras Walk");
    expect(locationPhrase(at("1501 N Broad St"))).toBe("on N Broad St");
    expect(locationPhrase(at("Oxford Rd"))).toBe("on Oxford Rd");
  });

  it("says 'in' for any other area, and never matches inside a word", () => {
    expect(locationPhrase(at("Avery"))).toBe("in Avery");
    expect(locationPhrase(at("Student Center"))).toBe("in Student Center");
    expect(locationPhrase(at("The Wall"))).toBe("in The Wall");
  });

  it("never shows a full address", () => {
    const full = "Morgan Hall North, 1394 Cecil B. Moore Ave, Philadelphia, PA 19122";
    expect(locationPhrase(at(full))).toBe("in Morgan Hall North");
    expect(locationPhrase(at("1394 Cecil B. Moore Ave, Philadelphia, PA 19122"))).toBe(
      "on Cecil B. Moore Ave",
    );
    expect(locationPhrase(at("1394 Cecil B. Moore Ave", { mapZone: "avery" }))).toBe(
      "in Avery",
    );
    expect(locationPhrase(at("12345"))).toBeNull();
  });

  it("keeps trucks approximate and returns null with no location", () => {
    expect(locationPhrase(at("Avery", { type: "truck" }))).toBe("near Avery");
    expect(locationPhrase(at(null))).toBeNull();
  });
});
