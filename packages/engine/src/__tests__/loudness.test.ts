import { describe, expect, it } from "vitest";

import { DEFAULT_GAMMA, bipolarBand, normalizedBand } from "../loudness";

describe("normalizedBand", () => {
  it("maps 0 and 1 to themselves regardless of gamma", () => {
    expect(normalizedBand(0)).toBe(0);
    expect(normalizedBand(1)).toBe(1);
    expect(normalizedBand(0, { gamma: 2.5 })).toBe(0);
    expect(normalizedBand(1, { gamma: 2.5 })).toBe(1);
  });

  it("brightens quiet input using the default (Classic-derived) gamma", () => {
    // Math.pow(0.3, 1.3) — quiet input should map above the linear value.
    expect(normalizedBand(0.3)).toBeCloseTo(Math.pow(0.3, DEFAULT_GAMMA));
    expect(normalizedBand(0.3)).toBeGreaterThan(0.3 * 0.3); // clearly above a steep curve
  });

  it("supports a custom gamma", () => {
    expect(normalizedBand(0.5, { gamma: 2 })).toBeCloseTo(0.25);
    expect(normalizedBand(0.5, { gamma: 1 })).toBeCloseTo(0.5);
  });

  it("clamps out-of-range input", () => {
    expect(normalizedBand(-1)).toBe(0);
    expect(normalizedBand(2)).toBe(1);
  });

  it("is monotonically non-decreasing", () => {
    let prev = -1;
    for (let v = 0; v <= 1; v += 0.05) {
      const out = normalizedBand(v);
      expect(out).toBeGreaterThanOrEqual(prev);
      prev = out;
    }
  });
});

describe("bipolarBand", () => {
  it("maps the midpoint to exactly 0", () => {
    expect(bipolarBand(0.5)).toBe(0);
  });

  it("maps 0 and 1 to -0.5 and 0.5", () => {
    expect(bipolarBand(0)).toBeCloseTo(-0.5);
    expect(bipolarBand(1)).toBeCloseTo(0.5);
  });

  it("preserves sign relative to the 0.5 midpoint", () => {
    expect(bipolarBand(0.3)).toBeLessThan(0);
    expect(bipolarBand(0.7)).toBeGreaterThan(0);
  });

  it("is symmetric around the midpoint", () => {
    expect(bipolarBand(0.3)).toBeCloseTo(-bipolarBand(0.7));
  });

  it("clamps out-of-range input", () => {
    expect(bipolarBand(-1)).toBeCloseTo(-0.5);
    expect(bipolarBand(2)).toBeCloseTo(0.5);
  });
});
