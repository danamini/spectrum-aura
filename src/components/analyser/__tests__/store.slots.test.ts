import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./helpers/test-helpers";

const SLOTS_KEY = "analyser-slots-v1";

describe("settingsStore slots", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
  });

  it("seeds deployment default slots for first-time users", async () => {
    const { settingsStore, SLOT_COUNT } = await import("../store");

    const slots = settingsStore.getSlots();

    expect(slots).toHaveLength(SLOT_COUNT);
    // Every bundled look has a real, unique name; none is an auto-numbered save.
    expect(slots[0]?.name).toBe("Signal Lab");
    const names = slots.map((slot) => slot.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.some((name) => /^(Slot|Save)\s+\d+$/.test(name))).toBe(false);
  });

  it("uses localStorage slots when present", async () => {
    localStorage.setItem(
      SLOTS_KEY,
      JSON.stringify([{ name: "My Override", settings: { view: "classic", barCount: 72 } }, null]),
    );
    localStorage.setItem("analyser-default-saves-version", "3");

    const { settingsStore } = await import("../store");

    const [slot1, slot2] = settingsStore.getSlots();
    expect(settingsStore.getSlots()).toHaveLength(1);
    expect(slot1?.name).toBe("My Override");
    expect(slot1?.settings.view).toBe("classic");
    expect(slot1?.settings.barCount).toBe(72);
    expect(slot2).toBeUndefined();
  });

  it("maps legacy rippleWaveLayers when loading a saved slot", async () => {
    localStorage.setItem(
      SLOTS_KEY,
      JSON.stringify([
        {
          name: "Legacy Ripple",
          settings: {
            view: "ripple",
            rippleWaveLayers: 11,
          },
        },
      ]),
    );

    const { settingsStore } = await import("../store");

    settingsStore.loadSlot(0);
    const state = settingsStore.get();

    expect(state.view).toBe("ripple");
    expect(state.rippleColumns).toBe(11);
  });

  it("preserves slot cycling flags when loading a slot", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.set({
      slotCycleMode: true,
      slotCycleSeconds: 33,
      view: "classic",
    });

    settingsStore.saveSlot(0, "Cycle-safe");

    settingsStore.set({
      slotCycleMode: false,
      slotCycleSeconds: 8,
      view: "ripple",
    });

    settingsStore.loadSlot(0);
    const state = settingsStore.get();

    expect(state.view).toBe("classic");
    expect(state.slotCycleMode).toBe(false);
    expect(state.slotCycleSeconds).toBe(8);
  });

  it("names a new preset for what it shows", async () => {
    const { settingsStore, SLOT_COUNT } = await import("../store");

    settingsStore.set({ view: "classic", gain: 1.3 });
    settingsStore.saveSlot(SLOT_COUNT);

    const slots = settingsStore.getSlots();
    expect(slots).toHaveLength(SLOT_COUNT + 1);
    expect(slots.at(-1)?.name).toMatch(/^Classic/);
    expect(new Set(slots.map((slot) => slot.name)).size).toBe(slots.length);
  });

  it("keeps a preset's name when it is saved over", async () => {
    const { settingsStore } = await import("../store");

    const before = settingsStore.getSlots()[2].name;
    settingsStore.set({ gain: 1.3 });
    settingsStore.saveSlot(2);

    expect(settingsStore.getSlots()[2].name).toBe(before);
  });

  it("removes cleared saves instead of leaving empty placeholders", async () => {
    const { settingsStore, SLOT_COUNT } = await import("../store");

    settingsStore.clearSlot(1);

    const slots = settingsStore.getSlots();
    expect(slots).toHaveLength(SLOT_COUNT - 1);
    expect(slots.every((slot) => slot != null)).toBe(true);
  });

  it("leaves the other names alone when a preset is deleted", async () => {
    const { settingsStore, SLOT_COUNT } = await import("../store");

    settingsStore.saveSlot(SLOT_COUNT, "Save 35");
    settingsStore.set({ gain: 1.7 });
    settingsStore.saveSlot(SLOT_COUNT + 1, "Save 36");
    const before = settingsStore.getSlots().map((slot) => slot.name);
    settingsStore.clearSlot(1);

    const names = settingsStore.getSlots().map((slot) => slot.name);
    expect(names).toEqual(before.filter((_, index) => index !== 1));
    expect(names.slice(-2)).toEqual(["Save 35", "Save 36"]);
  });
});

describe("current saved look", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
    localStorage.setItem(SLOTS_KEY, "[]");
    localStorage.setItem("analyser-default-saves-version", "3");
  });

  it("tracks save, edit, revert and deletion without treating HUD controls as edits", async () => {
    const { settingsStore: store } = await import("../store");
    expect(store.getCurrentSaveIndex()).toBe(-1);
    store.saveSlot(0, "Original");
    expect(store.getCurrentSaveIndex()).toBe(0);
    const originalGain = store.get().gain;
    store.set({ showBPM: !store.get().showBPM, showLatency: true, ambientMode: true });
    expect(store.getCurrentSaveIndex()).toBe(0);
    store.set({ gain: originalGain + 0.25 });
    expect(store.getCurrentSaveIndex()).toBe(-1);
    store.set({ gain: originalGain });
    expect(store.getCurrentSaveIndex()).toBe(0);
    store.clearSlot(0);
    expect(store.getCurrentSaveIndex()).toBe(-1);
  });

  it("follows loads from outside the toolbar and slot reindexing", async () => {
    const { settingsStore: store } = await import("../store");
    store.saveSlot(0, "A");
    store.set({ gain: 2 });
    store.saveSlot(1, "B");
    store.loadSlot(0);
    expect(store.getCurrentSaveIndex()).toBe(0);
    store.loadSlot(1);
    expect(store.getCurrentSaveIndex()).toBe(1);
    store.clearSlot(0);
    expect(store.getCurrentSaveIndex()).toBe(0);
  });

  it("preserves session controls on load while recognizing the saved look", async () => {
    const { settingsStore: store } = await import("../store");
    store.saveSlot(0, "A");
    store.set({ showBPM: true, showLatency: true, performance: true, ambientMode: true, gain: 3 });
    store.loadSlot(0);
    expect(store.get()).toMatchObject({
      showBPM: true,
      showLatency: true,
      performance: true,
      ambientMode: true,
    });
    expect(store.get().gain).toBe(1);
    expect(store.getCurrentSaveIndex()).toBe(0);
  });

  it("recognizes array values but treats pinned FX that differ from a save as edits", async () => {
    const { settingsStore: store } = await import("../store");
    store.saveSlot(0, "A");
    store.set({ fxPipelineOrder: [...store.get().fxPipelineOrder] });
    expect(store.getCurrentSaveIndex()).toBe(0);
    store.set({ fxLocks: ["grading"], exposure: 1.8 });
    store.loadSlot(0);
    expect(store.get().exposure).toBe(1.8);
    expect(store.getCurrentSaveIndex()).toBe(-1);
  });
  it("keeps response and Auto balance calibration when loading saved looks", async () => {
    const { settingsStore: store } = await import("../store");
    store.saveSlot(0, "A");
    store.set({ visualResponse: 2, autoBalanceEnabled: true });
    expect(store.getCurrentSaveIndex()).toBe(0);
    store.loadSlot(0);
    expect(store.get().visualResponse).toBe(2);
    expect(store.get().autoBalanceEnabled).toBe(true);
  });
});

describe("bundled presets", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
  });

  it("ships a thumbnail file for every bundled preset", async () => {
    const { existsSync } = await import("node:fs");
    const { settingsStore } = await import("../store");
    for (const slot of settingsStore.getSlots()) {
      expect(slot.thumb, slot.name).toMatch(/^assets\/default-looks\/[a-z0-9-]+\.jpg$/);
      expect(existsSync(`public/${slot.thumb}`), slot.thumb).toBe(true);
    }
  });

  it("opens a first visit on the first bundled preset", async () => {
    const { settingsStore } = await import("../store");
    expect(settingsStore.get().view).toBe(settingsStore.getSlots()[0]!.settings.view);
    expect(settingsStore.getCurrentSaveIndex()).toBe(0);
    // Session controls keep their defaults rather than the preset's values...
    const { DEFAULT_SETTINGS } = await import("@spectrum-aura/engine/settings");
    expect(settingsStore.get().ambientMode).toBe(DEFAULT_SETTINGS.ambientMode);
    // ...except that a first visit plays through the presets.
    expect(settingsStore.get().slotCycleMode).toBe(true);
  });

  it("stops playing the presets when a first-time visitor changes the picture", async () => {
    const { settingsStore } = await import("../store");
    expect(settingsStore.get().slotCycleMode).toBe(true);

    // Session controls (choosing ambient mode in the input prompt) do not count.
    settingsStore.set({ ambientMode: true });
    expect(settingsStore.get().slotCycleMode).toBe(true);

    settingsStore.set({ view: "classic" });
    expect(settingsStore.get().slotCycleMode).toBe(false);

    // Turning playback back on by hand is respected from then on.
    settingsStore.set({ slotCycleMode: true });
    settingsStore.set({ view: "outrun" });
    expect(settingsStore.get().slotCycleMode).toBe(true);
  });

  it("stops playing the presets when a first-time visitor randomizes", async () => {
    const { settingsStore } = await import("../store");
    settingsStore.randomize();
    expect(settingsStore.get().slotCycleMode).toBe(false);
  });

  it("gives an older stored list the new presets and missing thumbnails, once", async () => {
    const { settingsStore: fresh } = await import("../store");
    const bundled = fresh.getSlots();
    const old = bundled.find((slot) => slot.name === "Ripple Cylinders")!;
    // A list saved before thumbnails and the showcase presets existed.
    localStorage.setItem(
      SLOTS_KEY,
      JSON.stringify([
        { name: "Mine", settings: { view: "classic", barCount: 71 } },
        { name: old.name, settings: old.settings },
      ]),
    );
    localStorage.removeItem("analyser-default-saves-version");

    vi.resetModules();
    const { settingsStore: upgraded } = await import("../store");
    const names = upgraded.getSlots().map((slot) => slot.name);
    expect(names.slice(0, 2)).toEqual(["Mine", old.name]);
    expect(names).toContain("Hi-Fi Rack");
    expect(upgraded.getSlots()[0]!.thumb).toBeUndefined();
    expect(upgraded.getSlots()[1]!.thumb).toBe(old.thumb);
    // Older bundled presets the user no longer has are not brought back.
    expect(names.length).toBeLessThan(bundled.length);

    // Deleting a new preset sticks: the next load does not re-add it.
    upgraded.clearSlot(names.indexOf("Hi-Fi Rack"));
    vi.resetModules();
    const { settingsStore: again } = await import("../store");
    expect(again.getSlots().map((slot) => slot.name)).not.toContain("Hi-Fi Rack");
  });

  it("resolves bundled and captured thumbnails to image URLs", async () => {
    const { slotThumbSrc } = await import("../store");
    expect(slotThumbSrc("data:image/jpeg;base64,AAAA")).toBe("data:image/jpeg;base64,AAAA");
    expect(slotThumbSrc("assets/default-looks/outrun-sunset.jpg")).toBe(
      "/assets/default-looks/outrun-sunset.jpg",
    );
  });
});
