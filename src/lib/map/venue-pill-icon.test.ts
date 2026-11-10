import { describe, expect, it } from "vitest";

import { fitLabel } from "./venue-pill-icon";

describe("fitLabel", () => {
  const measure = (t: string) => t.length * 10;
  it("leaves short names alone", () => {
    expect(fitLabel(measure, "Cava", 100)).toBe("Cava");
  });
  it("truncates long names with an ellipsis within the width", () => {
    const out = fitLabel(measure, "Maxi's Pizza, Subs and Bar & Grill", 100);
    expect(out.endsWith("…")).toBe(true);
    expect(measure(out)).toBeLessThanOrEqual(100);
  });
});
