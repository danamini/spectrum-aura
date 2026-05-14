import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./test-helpers";

const MIN_VIEW_AMPLITUDE = 0.5;
const BLOOM_STRENGTH_MAX_NORMAL = 0.25;
const VIGNETTE_AMOUNT_MIN = 0.5;
const VIGNETTE_AMOUNT_MAX = 1.25;

describe("settingsStore normalization", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
  });

  it("enforces minimum amplitude floor for reactive views", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({
      rippleAmplitude: 0,
      datastreamAmplitude: 0.1,
      nebulaAmplitude: 0.25,
      monolithAmplitude: 0.49,
      mandalaAmplitude: 0.3,
      terrainAmplitude: 0.05,
    });

    const state = settingsStore.get();

    expect(state.rippleAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.datastreamAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.nebulaAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.monolithAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.mandalaAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.terrainAmplitude).toBe(MIN_VIEW_AMPLITUDE);
  });

  it("clamps vignette amount to supported bounds", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({ vignetteAmount: 0.01 });
    expect(settingsStore.get().vignetteAmount).toBe(VIGNETTE_AMOUNT_MIN);

    settingsStore.set({ vignetteAmount: 10 });
    expect(settingsStore.get().vignetteAmount).toBe(VIGNETTE_AMOUNT_MAX);
  });

  it("caps bloom strength unless extreme mode is enabled", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({ bloomExtreme: false, bloomStrength: 0.9 });
    expect(settingsStore.get().bloomStrength).toBe(BLOOM_STRENGTH_MAX_NORMAL);

    settingsStore.set({ bloomExtreme: true, bloomStrength: 0.9 });
    expect(settingsStore.get().bloomStrength).toBe(0.9);
  });

  it("clears activePreset on manual edits", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.applyPreset("Cinematic");
    expect(settingsStore.get().activePreset).toBe("Cinematic");

    settingsStore.set({ barCount: 144 });
    expect(settingsStore.get().activePreset).toBeNull();
  });

  it("retains activePreset only when explicitly passed", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({ activePreset: "Manual" });
    expect(settingsStore.get().activePreset).toBe("Manual");

    settingsStore.set({ activePreset: "Cinematic" });
    expect(settingsStore.get().activePreset).toBe("Cinematic");
  });

  it("reset restores baseline defaults", async () => {
    const { DEFAULT_SETTINGS, settingsStore } = await import("./store");

    settingsStore.set({
      view: "soundwall",
      barCount: 64,
      randomizeViewSettings: true,
      torusCount: 5,
      geometrynebulaSpread: 2.9,
    });

    settingsStore.reset();
    const state = settingsStore.get();

    expect(state.view).toBe(DEFAULT_SETTINGS.view);
    expect(state.barCount).toBe(DEFAULT_SETTINGS.barCount);
    expect(state.randomizeViewSettings).toBe(false);
    expect(state.torusCount).toBe(DEFAULT_SETTINGS.torusCount);
    expect(state.geometrynebulaSpread).toBe(DEFAULT_SETTINGS.geometrynebulaSpread);
  });
});
