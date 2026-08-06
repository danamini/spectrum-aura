import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./helpers/test-helpers";

describe("settingsStore randomize", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
  });

  it("includes new torus and geometry-nebula defaults", async () => {
    const { settingsStore } = await import("../store");

    const state = settingsStore.get();

    expect(state.randomizeViewSettings).toBe(false);
    expect(state.torusCount).toBe(1);
    expect(state.torusSpacing).toBe(11.4);
    expect(state.torusParticleSize).toBe(0.06);
    expect(state.geometrynebulaAmplitude).toBe(1.5);
    expect(state.geometrynebulaSpread).toBe(1.6);
    expect(state.geometrynebulaOrbitSpeed).toBe(1);
    expect(state.geometrynebulaSpinSpeed).toBe(1);
    expect(state.reztubeLineWidth).toBe(1);
    expect(state.assetflowAmplitude).toBe(1);
    expect(state.assetflowModelCount).toBe(24);
    expect(state.assetflowIncludeShapes).toBe(false);
    expect(state.assetflowSpread).toBe(4.7);
    expect(state.assetflowMovement).toBe(0.7);
    expect(state.assetflowBackgroundDrift).toBe(1);
    expect(state.assetOverlayFx).toBe(false);
    expect(state.crtFx).toBe(false);
    expect(state.projectorFilmFx).toBe(false);
    expect(state.crtScanlineIntensity).toBe(0.35);
    expect(state.projectorFilmAmount).toBe(0.45);
    expect(state.asciiFx).toBe(false);
    expect(state.asciiCellSize).toBe(10);
    expect(state.asciiColored).toBe(true);
    expect(state.retroFx).toBe(false);
    expect(state.retroSystem).toBe("zx");
    expect(state.retroMode).toBe("pixels");
    expect(state.retroDither).toBe(0.55);
    expect(state.retroBorder).toBe(true);
  });

  it("rolls ASCII as an exclusive statement effect within its slice of the draw", async () => {
    const { settingsStore } = await import("../store");

    // statementDraw = 0.45 lands in the ASCII slice [0.43, 0.47) — every other
    // statement effect must stay off, and the cell size stays in range.
    const asciiSpy = vi.spyOn(Math, "random").mockReturnValue(0.45);
    settingsStore.randomize();
    let state = settingsStore.get();
    expect(state.asciiFx).toBe(true);
    expect(state.retroFx).toBe(false);
    expect(state.kaleidoscope).toBe(false);
    expect(state.mirrorFx).toBe(false);
    expect(state.pixelate).toBe(false);
    expect(state.sobelMode).toBe(false);
    expect(state.glitch).toBe(false);
    expect(state.asciiCellSize).toBeGreaterThanOrEqual(4);
    expect(state.asciiCellSize).toBeLessThanOrEqual(32);
    asciiSpy.mockRestore();

    // Outside the slice ASCII stays off.
    const offSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    settingsStore.randomize();
    state = settingsStore.get();
    expect(state.asciiFx).toBe(false);
    offSpy.mockRestore();
  });

  it("rolls the retro system as an exclusive statement effect within its slice", async () => {
    const { settingsStore } = await import("../store");
    const { RETRO_SYSTEMS, RETRO_DISPLAY_MODES } = await import("@spectrum-aura/engine/settings");

    // statementDraw = 0.48 lands in the retro slice [0.47, 0.5).
    const retroSpy = vi.spyOn(Math, "random").mockReturnValue(0.48);
    settingsStore.randomize();
    let state = settingsStore.get();
    expect(state.retroFx).toBe(true);
    expect(state.asciiFx).toBe(false);
    expect(state.kaleidoscope).toBe(false);
    expect(state.mirrorFx).toBe(false);
    expect(state.pixelate).toBe(false);
    expect(state.sobelMode).toBe(false);
    expect(state.glitch).toBe(false);
    expect(RETRO_SYSTEMS.some((sys) => sys.id === state.retroSystem)).toBe(true);
    expect(RETRO_DISPLAY_MODES).toContain(state.retroMode);
    expect(state.retroDither).toBeGreaterThanOrEqual(0);
    expect(state.retroDither).toBeLessThanOrEqual(1);
    retroSpy.mockRestore();

    // Outside the slice retro stays off.
    const offSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    settingsStore.randomize();
    state = settingsStore.get();
    expect(state.retroFx).toBe(false);
    offSpy.mockRestore();
  });

  it("keeps pinned FX groups untouched and suppresses new statement effects", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({
      fxLocks: ["retro"],
      retroFx: true,
      retroSystem: "c64",
      retroMode: "text",
      retroDither: 0.42,
      retroBorder: false,
    });

    // 0.45 lands in the ASCII statement slice — but with a pinned statement
    // effect already on, randomize must not stack a second one.
    const spy = vi.spyOn(Math, "random").mockReturnValue(0.45);
    settingsStore.randomize();
    const state = settingsStore.get();
    expect(state.retroFx).toBe(true);
    expect(state.retroSystem).toBe("c64");
    expect(state.retroMode).toBe("text");
    expect(state.retroDither).toBe(0.42);
    expect(state.retroBorder).toBe(false);
    expect(state.asciiFx).toBe(false);
    expect(state.fxLocks).toEqual(["retro"]);
    spy.mockRestore();
  });

  it("drops unknown fx lock ids on load-time normalization", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({ fxLocks: ["retro", "nope", "retro"] as never });
    expect(settingsStore.get().fxLocks).toEqual(["retro"]);
  });

  it("canonicalizes the fx pipeline order and randomize preserves it", async () => {
    const { settingsStore, DEFAULT_FX_PIPELINE_ORDER } = await import("../store");

    // Custom prefix survives; junk is dropped; missing passes are appended.
    settingsStore.set({ fxPipelineOrder: ["retro", "crt", "bogus", "retro"] as never });
    const order = settingsStore.get().fxPipelineOrder;
    expect(order.slice(0, 2)).toEqual(["retro", "crt"]);
    expect([...order].sort()).toEqual([...DEFAULT_FX_PIPELINE_ORDER].sort());

    const spy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    settingsStore.randomize();
    expect(settingsStore.get().fxPipelineOrder).toEqual(order);
    spy.mockRestore();
  });

  it("keeps randomize scoped to post FX when view settings are disabled", async () => {
    const { settingsStore } = await import("../store");

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
    const { settingsStore } = await import("../store");

    settingsStore.set({
      torusCount: 1,
      torusSpacing: 11.4,
      geometrynebulaSpread: 1.6,
      geometrynebulaOrbitSpeed: 1,
      geometrynebulaSpinSpeed: 1,
      assetflowModelScale: 1,
      assetflowMovement: 1,
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
    expect(state.assetflowModelScale).toBeGreaterThan(1.7);
    expect(state.assetflowMovement).toBeGreaterThan(1.4);
    expect(state.assetflowBackgroundDrift).toBeGreaterThan(2.7);
    expect(state.stagelightsAmplitude).toBeGreaterThan(2.9);
    expect(state.stagelightsSweepSpeed).toBeGreaterThan(2.4);
    expect(state.stagelightsFixtureCount).toBe(7);

    randomSpy.mockRestore();
  });

  it("randomizes the wikichroma actor controls within their valid ranges", async () => {
    const { settingsStore, WIKICHROMA_ACTOR_PACKS } = await import("../store");

    settingsStore.set({ randomizeViewSettings: true });

    // High roll: every b() is false, pick() lands on the last option — the
    // pack subset comes up empty and must fall back to a single valid pack.
    const highSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);
    settingsStore.randomize();
    let state = settingsStore.get();
    expect(state.wikichromaFlowStrength).toBeGreaterThan(1.6);
    expect(state.wikichromaFlowStrength).toBeLessThanOrEqual(2);
    expect(state.wikichromaBeatsPerLoop).toBe(4);
    expect(state.wikichromaActorPacks).toEqual(["fox"]);
    highSpy.mockRestore();

    // Low roll: every b() is true — all packs selected.
    const lowSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    settingsStore.randomize();
    state = settingsStore.get();
    expect(state.wikichromaBeatsPerLoop).toBe(1);
    expect(state.wikichromaActorPacks).toEqual([...WIKICHROMA_ACTOR_PACKS]);
    lowSpy.mockRestore();
  });

  it("randomize sets lensFlare and lensFlareAmount in postFx patch", async () => {
    const { settingsStore } = await import("../store");

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

  it("enables asset overlay when randomizing FX in assetflow view", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({ view: "assetflow", randomizeViewSettings: false, assetOverlayFx: false });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.1);
    settingsStore.randomize();
    const state = settingsStore.get();

    expect(state.randomizeViewSettings).toBe(false);
    expect(state.view).toBe("assetflow");
    expect(state.assetOverlayFx).toBe(true);
    expect(["mixed", "technical", "organic", "chaotic"]).toContain(state.assetOverlayBias);
    expect(state.assetOverlayCommonsEnabled).toBe(false);
    expect(state.textOverlaySource).toBe("public-domain");
    randomSpy.mockRestore();
  });
});
