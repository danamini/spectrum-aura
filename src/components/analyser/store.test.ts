import { beforeEach, describe, expect, it, vi } from "vitest";

const SLOTS_KEY = "analyser-slots-v1";

function createStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

describe("analyser store slot bootstrap", () => {
  beforeEach(() => {
    vi.resetModules();
    const storage = createStorageMock();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  });

  it("seeds deployment default slots for first-time users", async () => {
    const { settingsStore, SLOT_COUNT } = await import("./store");

    const slots = settingsStore.getSlots();

    expect(slots).toHaveLength(SLOT_COUNT);
    expect(slots.every((slot) => slot !== null)).toBe(true);
    expect(slots.map((slot) => slot?.name)).toEqual([
      "Slot 1",
      "Slot 2",
      "Slot 3",
      "Slot 4",
      "Slot 5",
    ]);
  });

  it("uses localStorage slots when present", async () => {
    localStorage.setItem(
      SLOTS_KEY,
      JSON.stringify([
        { name: "My Override", settings: { view: "classic", barCount: 72 } },
        null,
        null,
        null,
        null,
      ]),
    );

    const { settingsStore } = await import("./store");

    const [slot1, slot2] = settingsStore.getSlots();
    expect(slot1?.name).toBe("My Override");
    expect(slot1?.settings.view).toBe("classic");
    expect(slot1?.settings.barCount).toBe(72);
    expect(slot2).toBeNull();
  });
});

describe("analyser store utility functions", () => {
  beforeEach(() => {
    vi.resetModules();
    const storage = createStorageMock();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
  });

  it("enforces MIN_VIEW_AMPLITUDE floor of 0.5 on all amplitude settings", async () => {
    const { settingsStore, MIN_VIEW_AMPLITUDE } = await import("./store");

    // Set all amplitudes below minimum
    settingsStore.set({
      rippleAmplitude: 0.1,
      datastreamAmplitude: 0.2,
      nebulaAmplitude: 0.15,
      monolithAmplitude: 0.25,
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

  it("clamps vignette amount between 0.5 and 1.25", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({ vignetteAmount: 0.2 });
    let state = settingsStore.get();
    expect(state.vignetteAmount).toBeGreaterThanOrEqual(0.5);

    settingsStore.set({ vignetteAmount: 2.0 });
    state = settingsStore.get();
    expect(state.vignetteAmount).toBeLessThanOrEqual(1.25);
  });

  it("caps bloom strength to 0.25 unless bloomExtreme is enabled", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({ bloom: true, bloomExtreme: false, bloomStrength: 1.0 });
    let state = settingsStore.get();
    expect(state.bloomStrength).toBeLessThanOrEqual(0.25);

    settingsStore.set({ bloom: true, bloomExtreme: true, bloomStrength: 1.0 });
    state = settingsStore.get();
    expect(state.bloomStrength).toBe(1.0);
  });

  it("exposes the newer visual defaults", async () => {
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
    expect(state.motionTrails).toBe(false);
    expect(state.trailDecay).toBe(0.92);
    expect(state.ssao).toBe(false);
    expect(state.ssaoRadius).toBe(8);
    expect(state.radialBlur).toBe(false);
    expect(state.radialKickAmount).toBe(0.32);
    expect(state.sobelMode).toBe(false);
    expect(state.sobelStrength).toBe(1.5);
  });

  it("keeps randomize scoped to post fx when view settings are disabled", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({
      torusCount: 4,
      geometrynebulaSpread: 2.2,
      randomizeViewSettings: false,
    });

    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.99);

    settingsStore.randomize();
    const state = settingsStore.get();

    expect(state.torusCount).toBe(4);
    expect(state.geometrynebulaSpread).toBe(2.2);
    expect(state.randomizeViewSettings).toBe(false);
    expect(state.bgColor).toMatch(/^#[0-9a-f]{6}$/i);

    randomSpy.mockRestore();
  });

  it("randomizes the new view settings when the scope toggle is enabled", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({
      torusCount: 1,
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
    expect(state.geometrynebulaSpread).toBeGreaterThan(2.9);
    expect(state.geometrynebulaOrbitSpeed).toBeGreaterThan(2.4);
    expect(state.geometrynebulaSpinSpeed).toBeGreaterThan(3.8);

    randomSpy.mockRestore();
  });

  it("applies presets and normalizes settings", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.applyPreset("Cinematic");
    const state = settingsStore.get();

    // Cinematic preset should have vignette capped at 1.25
    expect(state.vignetteAmount).toBeLessThanOrEqual(1.25);
    expect(state.activePreset).toBe("Cinematic");

    // All amplitude values should be above minimum
    expect(state.rippleAmplitude).toBeGreaterThanOrEqual(0.5);
    expect(state.datastreamAmplitude).toBeGreaterThanOrEqual(0.5);
  });

  it("reset restores default settings", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.set({
      view: "classic",
      barCount: 50,
      vignetteAmount: 0.3,
    });

    settingsStore.reset();
    const state = settingsStore.get();

    // Should be back to default view
    expect(state.view).toBe("combo");
    expect(state.vignetteAmount).toBe(1.05);
  });

  it("save and load slots preserve settings", async () => {
    const { settingsStore } = await import("./store");

    // Customize settings
    settingsStore.set({ view: "classic", barCount: 100, vignetteAmount: 0.8 });

    // Save to slot 1
    settingsStore.saveSlot(0, "My Custom Preset");

    // Change settings
    settingsStore.set({ view: "ripple", barCount: 64 });

    // Load from slot 1
    settingsStore.loadSlot(0);
    const state = settingsStore.get();

    expect(state.view).toBe("classic");
    expect(state.barCount).toBe(100);
    // Vignette should be normalized even from loaded state
    expect(state.vignetteAmount).toBeLessThanOrEqual(1.25);
  });
});
