import { describe, expect, it } from "vitest";

import {
  getCampusParts,
  getOpenStatus,
  formatCampusNow,
  getDetailStatus,
  getPinStatus,
  minutesUntilClose,
  isHoursUnknown,
  isInRange,
  isOpenNow,
  type VenueHours,
} from "./hours";

const weekdayHours = (open: string, close: string): VenueHours => ({
  mon: [{ open, close }],
  tue: [{ open, close }],
  wed: [{ open, close }],
  thu: [{ open, close }],
  fri: [{ open, close }],
});

/** Build a Date that is that wall-clock time in America/New_York on a known weekday. */
function atCampusLocal(isoUtc: string): Date {
  return new Date(isoUtc);
}

describe("isInRange", () => {
  it("handles normal daytime ranges", () => {
    expect(isInRange(12 * 60, { open: "11:00", close: "15:00" })).toBe(true);
    expect(isInRange(10 * 60, { open: "11:00", close: "15:00" })).toBe(false);
    expect(isInRange(15 * 60, { open: "11:00", close: "15:00" })).toBe(false);
  });

  it("handles midnight-spanning ranges", () => {
    expect(isInRange(23 * 60, { open: "22:00", close: "02:00" })).toBe(true);
    expect(isInRange(1 * 60, { open: "22:00", close: "02:00" })).toBe(true);
    expect(isInRange(3 * 60, { open: "22:00", close: "02:00" })).toBe(false);
  });
});

describe("getOpenStatus", () => {
  it("returns Hours unknown when hours are null or empty", () => {
    expect(getOpenStatus(null).kind).toBe("unknown");
    expect(getOpenStatus({}).kind).toBe("unknown");
    expect(isHoursUnknown(null)).toBe(true);
    // Never "Closed" for unknown
    expect(getOpenStatus(null).label).toBe("Hours unknown");
  });

  it("reports open with hedged wording during posted hours", () => {
    // 2026-07-15 is a Wednesday; 16:00 UTC = 12:00 EDT
    const now = atCampusLocal("2026-07-15T16:00:00.000Z");
    const status = getOpenStatus(weekdayHours("11:00", "15:00"), now);
    expect(status.kind).toBe("open");
    expect(status.label).toMatch(/usually/);
    expect(isOpenNow(weekdayHours("11:00", "15:00"), now)).toBe(true);
  });

  it("reports closed outside posted hours", () => {
    // 20:00 UTC = 16:00 EDT — after 15:00 close
    const now = atCampusLocal("2026-07-15T20:00:00.000Z");
    const status = getOpenStatus(weekdayHours("11:00", "15:00"), now);
    expect(status.kind).toBe("closed");
    expect(status.label).toMatch(/Closed/);
  });

  it("stays correct across a DST spring-forward boundary", () => {
    // 2026-03-08 is DST start in US; Monday after the change.
    // 15:00 UTC = 11:00 EDT (UTC-4)
    const afterSpringForward = atCampusLocal("2026-03-09T15:00:00.000Z");
    const parts = getCampusParts(afterSpringForward);
    expect(parts.weekday).toBe("mon");
    expect(parts.minutes).toBe(11 * 60);

    const status = getOpenStatus(
      weekdayHours("10:00", "14:00"),
      afterSpringForward,
    );
    expect(status.kind).toBe("open");
  });

  it("stays correct across a DST fall-back boundary", () => {
    // 2026-11-01 is DST end; Monday after — 16:00 UTC = 11:00 EST (UTC-5)
    const afterFallBack = atCampusLocal("2026-11-02T16:00:00.000Z");
    const parts = getCampusParts(afterFallBack);
    expect(parts.weekday).toBe("mon");
    expect(parts.minutes).toBe(11 * 60);

    const status = getOpenStatus(weekdayHours("10:00", "14:00"), afterFallBack);
    expect(status.kind).toBe("open");
  });

  it("handles midnight-spanning open status into the next calendar day", () => {
    const hours: VenueHours = {
      fri: [{ open: "22:00", close: "02:00" }],
    };
    // Saturday 01:00 EDT = 05:00 UTC
    const saturdayEarly = atCampusLocal("2026-07-18T05:00:00.000Z");
    expect(getCampusParts(saturdayEarly).weekday).toBe("sat");
    expect(getOpenStatus(hours, saturdayEarly).kind).toBe("open");
  });
});

describe("getPinStatus", () => {
  // 2026-11-09 is a Monday (EST, UTC-5).
  const late: VenueHours = { mon: [{ open: "18:00", close: "02:00" }] };
  it("is open when more than an hour remains, counting past midnight", () => {
    const now = new Date("2026-11-10T02:40:00Z"); // Mon 21:40 EST
    expect(getPinStatus(late, now)).toBe("open");
    expect(minutesUntilClose(late, now)).toBe(260);
  });
  it("is closing within the last hour", () => {
    const now = new Date("2026-11-10T06:20:00Z"); // Tue 01:20 EST
    expect(getPinStatus(late, now)).toBe("closing");
    expect(minutesUntilClose(late, now)).toBe(40);
  });
  it("is closed outside hours and unknown without hours", () => {
    expect(getPinStatus(late, new Date("2026-11-09T17:00:00Z"))).toBe("closed");
    expect(getPinStatus(null)).toBe("unknown");
  });
});

describe("formatCampusNow", () => {
  it("reads as weekday, time in campus time", () => {
    expect(formatCampusNow(new Date("2026-11-10T02:40:00Z"))).toBe(
      "Monday, 9:40 PM",
    );
  });
});

describe("getDetailStatus", () => {
  const late: VenueHours = { mon: [{ open: "18:00", close: "04:00" }] };
  it("says how long is left tonight", () => {
    expect(getDetailStatus(late, new Date("2026-11-10T02:40:00Z"))).toEqual({
      kind: "open",
      closesAt: "04:00",
      left: "6 hours 20 minutes left tonight",
      closingSoon: false,
    });
  });
  it("names the day of the next opening", () => {
    expect(
      getDetailStatus(late, new Date("2026-11-10T15:00:00Z")),
    ).toMatchObject({ kind: "closed", opensAt: "18:00", when: "Monday" });
  });
});
