import { beforeEach, describe, expect, it, vi } from "vitest";

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

beforeEach(() => {
  vi.resetModules();
  Object.defineProperty(globalThis, "localStorage", {
    value: createStorageMock(),
    configurable: true,
    writable: true,
  });
});

describe("vaporwave curated presets", () => {
  it("keeps existing palette indices stable and appends the vaporwave palettes", async () => {
    const { PALETTES } = await import("../store");
    expect(PALETTES[0]?.name).toBe("Neon Sunset");
    expect(PALETTES[4]?.name).toBe("Vaporwave");
    expect(PALETTES[4]?.colors).toEqual(["#ff71ce", "#01cdfe", "#05ffa1"]);
    expect(PALETTES[5]?.name).toBe("Outrun Sunset");
  });

  it("defines the curated vaporwave preset set", async () => {
    const { PRESETS } = await import("../store");
    for (const name of [
      "Vaporwave Sunset",
      "Mallsoft Haze",
      "Outrun Grid",
      "Broken Transmission",
      "Marble Dream",
    ]) {
      expect(PRESETS[name], name).toBeDefined();
    }
  });

  it("applies Vaporwave Sunset with the vaporwave palette and marks it active", async () => {
    const { settingsStore } = await import("../store");
    settingsStore.applyPreset("Vaporwave Sunset");
    const s = settingsStore.get();
    expect(s.activePreset).toBe("Vaporwave Sunset");
    expect(s.paletteIndex).toBe(4);
    expect(s.bgColor).toBe("#1e1138");
    // Extreme bloom is declared, so strength must survive normalization.
    expect(s.bloomStrength).toBeCloseTo(0.6);
  });

  it("applies Outrun Grid as a full look including the wireframe terrain view", async () => {
    const { settingsStore } = await import("../store");
    settingsStore.applyPreset("Outrun Grid");
    const s = settingsStore.get();
    expect(s.view).toBe("terrain");
    expect(s.terrainWireframe).toBe(true);
    expect(s.terrainFullscreen).toBe(false);
    expect(s.paletteIndex).toBe(5);
  });

  it("keeps Broken Transmission glitch within the normalized intensity range", async () => {
    const { settingsStore } = await import("../store");
    settingsStore.applyPreset("Broken Transmission");
    const s = settingsStore.get();
    expect(s.glitch).toBe(true);
    expect(s.crtFx).toBe(true);
    expect(s.glitchIntensity).toBeGreaterThan(0);
    expect(s.glitchIntensity).toBeLessThanOrEqual(1);
  });
});

describe("midiEnabled setting", () => {
  it("defaults off and stays off through randomize", async () => {
    const { settingsStore } = await import("../store");
    expect(settingsStore.get().midiEnabled).toBe(false);
    settingsStore.set({ midiEnabled: true });
    settingsStore.randomize();
    // Randomize must never toggle the hardware/permission opt-in.
    expect(settingsStore.get().midiEnabled).toBe(true);
  });

  it("is preserved when loading a save slot (like performance mode)", async () => {
    const { settingsStore } = await import("../store");
    settingsStore.saveSlot(0, "look");
    settingsStore.set({ midiEnabled: true });
    settingsStore.loadSlot(0);
    expect(settingsStore.get().midiEnabled).toBe(true);
  });
});
