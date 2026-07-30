import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./helpers/test-helpers";

/**
 * Distribution-shape guarantees for randomize: perceptual parameters follow a
 * midpoint-weighted bell rather than uniform, and whole-frame "statement"
 * effects (kaleidoscope, mirror, pixelate, sobel, glitch) share one budget so
 * they never stack. Bounds are set many sigma from the true rates, so these
 * are deterministic in practice despite using real randomness.
 */
describe("settingsStore randomize distribution", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
  });

  it("activates at most one statement effect per roll", async () => {
    const { settingsStore } = await import("../store");
    for (let i = 0; i < 120; i += 1) {
      settingsStore.randomize();
      const s = settingsStore.get();
      const active = [s.kaleidoscope, s.mirrorFx, s.pixelate, s.sobelMode, s.glitch].filter(
        Boolean,
      ).length;
      expect(active).toBeLessThanOrEqual(1);
    }
  });

  it("keeps kaleidoscope rare", async () => {
    const { settingsStore } = await import("../store");
    let hits = 0;
    const rolls = 400;
    for (let i = 0; i < rolls; i += 1) {
      settingsStore.randomize();
      if (settingsStore.get().kaleidoscope) hits += 1;
    }
    // True rate is 7%; 15% of 400 is >6 sigma away.
    expect(hits / rolls).toBeLessThan(0.15);
  });

  it("keeps exposure inside the readable band and centered", async () => {
    const { settingsStore } = await import("../store");
    let sum = 0;
    const rolls = 200;
    for (let i = 0; i < rolls; i += 1) {
      settingsStore.randomize();
      const { exposure } = settingsStore.get();
      expect(exposure).toBeGreaterThanOrEqual(0.75);
      expect(exposure).toBeLessThanOrEqual(1.2);
      sum += exposure;
    }
    expect(sum / rolls).toBeGreaterThan(0.85);
    expect(sum / rolls).toBeLessThan(1.12);
  });

  it("clusters bloom strength away from the extreme top of its range", async () => {
    const { settingsStore } = await import("../store");
    for (let i = 0; i < 150; i += 1) {
      settingsStore.randomize();
      const s = settingsStore.get();
      // Non-extreme rolls stay within the gentle band; extreme bloom stays a
      // rare dark-background-only event with its own capped range.
      if (!s.bloomExtreme) expect(s.bloomStrength).toBeLessThanOrEqual(0.25);
      else expect(s.bloomStrength).toBeLessThanOrEqual(1.05);
    }
  });
});
