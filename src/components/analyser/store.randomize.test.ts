import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./test-helpers";

describe("settingsStore randomize", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
  });

  it("includes new torus and geometry-nebula defaults", async () => {
    const { settingsStore } = await import("./store");

    const state = settingsStore.get();

    expect(state.randomizeViewSettings).toBe(false);
    expect(state.torusCount).toBe(1);
    expect(state.torusSpacing).toBe(11.4);
    expect(state.torusParticleSize).toBe(0.06);
    expect(state.geometrynebulaAmplitude).toBe(1.5);
    expect(state.geometrynebulaSpread).toBe(1.6);
    expect(state.geometrynebulaOrbitSpeed).toBe(1);
    expect(state.geometrynebulaSpinSpeed).toBe(1);
  });

  it("keeps randomize scoped to post FX when view settings are disabled", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({
      torusCount: 4,
      geometrynebulaSpread: 2.2,
      rippleColumns: 17,
      randomizeViewSettings: false,
      activePreset: "Cinematic",
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);

    settingsStore.randomize();
    const state = settingsStore.get();

    expect(state.torusCount).toBe(4);
    expect(state.geometrynebulaSpread).toBe(2.2);
    expect(state.rippleColumns).toBe(17);
    expect(state.randomizeViewSettings).toBe(false);
    expect(state.activePreset).toBeNull();

    randomSpy.mockRestore();
  });

  it("randomizes view settings when scope toggle is enabled", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({
      torusCount: 1,
      torusSpacing: 11.4,
      geometrynebulaSpread: 1.6,
      geometrynebulaOrbitSpeed: 1,
      geometrynebulaSpinSpeed: 1,
      randomizeViewSettings: true,
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);

    settingsStore.randomize();
    const state = settingsStore.get();

    expect(state.randomizeViewSettings).toBe(true);
    expect(state.torusCount).toBe(5);
    expect(state.torusSpacing).toBeGreaterThan(23.7);
    expect(state.geometrynebulaSpread).toBeGreaterThan(2.9);
    expect(state.geometrynebulaOrbitSpeed).toBeGreaterThan(2.4);
    expect(state.geometrynebulaSpinSpeed).toBeGreaterThan(3.8);

    randomSpy.mockRestore();
  });

  it("randomize sets lensFlare and lensFlareAmount in postFx patch", async () => {
    const { settingsStore } = await import("./store");

    // With random=0.99, b(0.45)=false so lensFlare=false; amount=r(0.2,1.1)≈1.09
    const highSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    settingsStore.randomize();
    const highState = settingsStore.get();
    expect(highState.lensFlare).toBe(false);
    expect(highState.lensFlareAmount).toBeGreaterThan(1.0);
    highSpy.mockRestore();

    // With random=0.1, b(0.45)=true so lensFlare=true; amount=r(0.2,1.1)≈0.29
    const lowSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    settingsStore.randomize();
    const lowState = settingsStore.get();
    expect(lowState.lensFlare).toBe(true);
    expect(lowState.lensFlareAmount).toBeGreaterThanOrEqual(0.2);
    expect(lowState.lensFlareAmount).toBeLessThan(0.4);
    lowSpy.mockRestore();
  });
});
