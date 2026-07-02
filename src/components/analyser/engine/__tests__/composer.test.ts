import { describe, expect, it } from "vitest";

import { computeQualityTier } from "../composer";

describe("computeQualityTier", () => {
  it("stays at tier 0 while FPS is healthy, including a 60Hz display's normal dips", () => {
    expect(computeQualityTier(60, 0)).toBe(0);
    expect(computeQualityTier(55, 0)).toBe(0);
    expect(computeQualityTier(45, 0)).toBe(0);
  });

  it("downgrades to tier 1 once FPS dips below the tier-1 threshold", () => {
    expect(computeQualityTier(35, 0)).toBe(1);
  });

  it("downgrades straight to tier 2 under severe pressure, regardless of current tier", () => {
    expect(computeQualityTier(20, 0)).toBe(2);
    expect(computeQualityTier(20, 1)).toBe(2);
  });

  it("does not upgrade back to tier 0 until FPS clears the higher recovery threshold", () => {
    // Recovered past the downgrade cutoff (40) but not the upgrade one (54).
    expect(computeQualityTier(50, 1)).toBe(1);
    expect(computeQualityTier(54, 1)).toBe(0);
  });

  it("recovers one tier at a time (2 -> 1 -> 0), never skipping a tier", () => {
    expect(computeQualityTier(60, 2)).toBe(1);
    expect(computeQualityTier(60, 1)).toBe(0);
  });

  it("does not downgrade from tier 2 back down further than tier 2 itself", () => {
    expect(computeQualityTier(10, 2)).toBe(2);
  });

  it("stays at tier 2 while recovering FPS hasn't cleared the tier-1 recovery threshold", () => {
    expect(computeQualityTier(44, 2)).toBe(2);
  });

  it("pins the exact threshold boundaries (24/40 downgrade, 48/54 recovery)", () => {
    // Downgrade edges
    expect(computeQualityTier(23.9, 0)).toBe(2);
    expect(computeQualityTier(24, 0)).toBe(1);
    expect(computeQualityTier(39.9, 0)).toBe(1);
    expect(computeQualityTier(40, 0)).toBe(0);
    // Recovery edges
    expect(computeQualityTier(47.9, 2)).toBe(2);
    expect(computeQualityTier(48, 2)).toBe(1);
    expect(computeQualityTier(53.9, 1)).toBe(1);
    expect(computeQualityTier(54, 1)).toBe(0);
  });
});
