import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./helpers/test-helpers";

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
    const { settingsStore } = await import("../store");

    settingsStore.set({
      rippleAmplitude: 0,
      datastreamAmplitude: 0.1,
      nebulaAmplitude: 0.25,
      monolithAmplitude: 0.49,
      mandalaAmplitude: 0.3,
      terrainAmplitude: 0.05,
      assetflowAmplitude: 0.05,
    });

    const state = settingsStore.get();

    expect(state.rippleAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.datastreamAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.nebulaAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.monolithAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.mandalaAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.terrainAmplitude).toBe(MIN_VIEW_AMPLITUDE);
    expect(state.assetflowAmplitude).toBe(MIN_VIEW_AMPLITUDE);
  });

  it("clamps vignette amount to supported bounds", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({ vignetteAmount: 0.01 });
    expect(settingsStore.get().vignetteAmount).toBe(VIGNETTE_AMOUNT_MIN);

    settingsStore.set({ vignetteAmount: 10 });
    expect(settingsStore.get().vignetteAmount).toBe(VIGNETTE_AMOUNT_MAX);
  });

  it("clamps the new post-fx control ranges", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({
      trailDecay: 0.2,
      trailInject: 10,
      trailThreshold: -1,
      ssaoRadius: 100,
      ssaoDistance: 0,
      ssaoIntensity: 3,
      radialBase: -0.5,
      radialKickAmount: 3,
      radialZoom: 0,
      sobelStrength: 10,
      sobelThreshold: 0,
      sobelFillMix: 2,
      assetOverlayAmount: 10,
      assetOverlaySpeed: 0,
      assetflowModelScale: 10,
      assetflowSpriteAmount: 0,
      assetflowModelCount: 99,
      assetflowSpread: 99,
      assetflowSpin: -1,
      assetflowMovement: 99,
      assetflowBackgroundDrift: -1,
      glitchIntensity: 5,
    });

    const state = settingsStore.get();

    expect(state.trailDecay).toBe(0.75);
    expect(state.trailInject).toBe(2.25);
    expect(state.trailThreshold).toBe(0);
    expect(state.ssaoRadius).toBe(14);
    expect(state.ssaoDistance).toBe(0.01);
    expect(state.ssaoIntensity).toBe(1);
    expect(state.radialBase).toBe(0);
    expect(state.radialKickAmount).toBe(2);
    expect(state.radialZoom).toBe(0.05);
    expect(state.sobelStrength).toBe(4);
    expect(state.sobelThreshold).toBe(0.01);
    expect(state.sobelFillMix).toBe(1);
    expect(state.assetOverlayAmount).toBe(2);
    expect(state.assetOverlaySpeed).toBe(0.1);
    expect(state.assetflowModelScale).toBe(2.2);
    expect(state.assetflowSpriteAmount).toBe(0.2);
    expect(state.assetflowModelCount).toBe(24);
    expect(state.assetflowSpread).toBe(12);
    expect(state.assetflowSpin).toBe(0);
    expect(state.assetflowMovement).toBe(1.8);
    expect(state.assetflowBackgroundDrift).toBe(0);
    expect(state.glitchIntensity).toBe(1);
  });

  it("defaults glitchIntensity to 1 (matches pre-existing always-on behavior)", async () => {
    const { DEFAULT_SETTINGS } = await import("../store");
    expect(DEFAULT_SETTINGS.glitchIntensity).toBe(1);
  });

  it("defaults Dynamic Mode to off and clamps evolveAmount to 0-1", async () => {
    const { DEFAULT_SETTINGS, settingsStore } = await import("../store");
    expect(DEFAULT_SETTINGS.evolveEnabled).toBe(false);

    settingsStore.set({ evolveAmount: 5 });
    expect(settingsStore.get().evolveAmount).toBe(1);

    settingsStore.set({ evolveAmount: -2 });
    expect(settingsStore.get().evolveAmount).toBe(0);
  });

  it("caps bloom strength unless extreme mode is enabled", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({ bloomExtreme: false, bloomStrength: 0.9 });
    expect(settingsStore.get().bloomStrength).toBe(BLOOM_STRENGTH_MAX_NORMAL);

    settingsStore.set({ bloomExtreme: true, bloomStrength: 0.9 });
    expect(settingsStore.get().bloomStrength).toBe(0.9);
  });

  it("clears activePreset on manual edits", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.applyPreset("Cinematic");
    expect(settingsStore.get().activePreset).toBe("Cinematic");

    settingsStore.set({ barCount: 144 });
    expect(settingsStore.get().activePreset).toBeNull();
  });

  it("retains activePreset only when explicitly passed", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({ activePreset: "Manual" });
    expect(settingsStore.get().activePreset).toBe("Manual");

    settingsStore.set({ activePreset: "Cinematic" });
    expect(settingsStore.get().activePreset).toBe("Cinematic");
  });

  it("reset restores baseline defaults", async () => {
    const { DEFAULT_SETTINGS, settingsStore } = await import("../store");

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
