import { describe, expect, it } from "vitest";

import {
  bestStatus,
  clusterPriority,
  pinPriority,
  showsPlateAtOverview,
  truncateLabel,
} from "./venue-pin-rules";

describe("truncateLabel", () => {
  it("leaves names of 14 characters or fewer alone", () => {
    expect(truncateLabel("Cava")).toBe("Cava");
    expect(truncateLabel("Richie's Lunch")).toBe("Richie's Lunch");
  });

  it("cuts longer names to 14 characters including the ellipsis", () => {
    const out = truncateLabel("Maxi's Pizza, Subs and Bar & Grill");
    expect(out).toBe("Maxi's Pizza,…");
    expect(Array.from(out)).toHaveLength(14);
  });

  it("does not leave a space before the ellipsis", () => {
    expect(truncateLabel("Chicken Rice Plates")).toBe("Chicken Rice…");
  });
});

describe("showsPlateAtOverview", () => {
  it("keeps open and closing-soon plates, dots the rest", () => {
    expect(showsPlateAtOverview("open", "normal")).toBe(true);
    expect(showsPlateAtOverview("closing", "normal")).toBe(true);
    expect(showsPlateAtOverview("closed", "normal")).toBe(false);
    expect(showsPlateAtOverview("unknown", "normal")).toBe(false);
  });

  it("always shows a selected or hovered plate", () => {
    expect(showsPlateAtOverview("closed", "selected")).toBe(true);
    expect(showsPlateAtOverview("unknown", "hover")).toBe(true);
  });
});

describe("pinPriority", () => {
  it("orders selected > open > closing > closed (lower places first)", () => {
    const order = [
      pinPriority("closed", "selected"),
      pinPriority("open", "normal"),
      pinPriority("closing", "normal"),
      pinPriority("closed", "normal"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("puts a cluster just ahead of single plates of its best status", () => {
    expect(clusterPriority("open")).toBeLessThan(pinPriority("open", "normal"));
    expect(clusterPriority("open")).toBeGreaterThan(
      pinPriority("open", "hover"),
    );
  });
});

describe("bestStatus", () => {
  it("picks the most useful member status", () => {
    expect(bestStatus(["closed", "closing", "unknown"])).toBe("closing");
    expect(bestStatus(["unknown"])).toBe("unknown");
  });
});
