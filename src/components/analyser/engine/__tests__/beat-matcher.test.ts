import { describe, expect, it } from "vitest";

import { BeatMatcher } from "../beat-matcher";

describe("BeatMatcher", () => {
  it("detects bass spike beats with adaptive threshold", () => {
    const matcher = new BeatMatcher();
    for (let i = 0; i < 20; i++) {
      matcher.detect(0.2, 0.15, 0.1, 0.3, 1.35, i * 50);
    }
    const kick = matcher.detect(0.85, 0.4, 0.2, 0.35, 1.35, 1100);
    expect(kick.beat).toBe(true);
    expect(kick.onsetStrength).toBeGreaterThan(0);
  });

  it("flags signal swings on large mid/bass changes", () => {
    const matcher = new BeatMatcher();
    matcher.detect(0.3, 0.2, 0.1, 0.4, 1.35, 0);
    const swing = matcher.detect(0.55, 0.45, 0.15, 0.55, 1.35, 50);
    expect(swing.signalSwing).toBe(true);
    expect(matcher.signalChangeAt).toBeGreaterThan(0);
  });
});
