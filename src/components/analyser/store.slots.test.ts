import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./test-helpers";

const SLOTS_KEY = "analyser-slots-v1";

describe("settingsStore slots", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
  });

  it("seeds deployment default slots for first-time users", async () => {
    const { settingsStore, SLOT_COUNT } = await import("./store");

    const slots = settingsStore.getSlots();

    expect(slots).toHaveLength(SLOT_COUNT);
    expect(slots[0]?.name).toBe("Slot 1");
    expect(slots[1]?.name).toBe("Slot 2");
    expect(slots[2]?.name).toBe("Slot 3");
    expect(slots[3]?.name).toBe("Save 1");
  });

  it("uses localStorage slots when present", async () => {
    localStorage.setItem(
      SLOTS_KEY,
      JSON.stringify([{ name: "My Override", settings: { view: "classic", barCount: 72 } }, null]),
    );

    const { settingsStore } = await import("./store");

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

    const { settingsStore } = await import("./store");

    settingsStore.loadSlot(0);
    const state = settingsStore.get();

    expect(state.view).toBe("ripple");
    expect(state.rippleColumns).toBe(11);
  });

  it("preserves slot cycling flags when loading a slot", async () => {
    const { settingsStore } = await import("./store");

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

  it("appends new saves beyond the deployment defaults", async () => {
    const { settingsStore, SLOT_COUNT } = await import("./store");

    settingsStore.saveSlot(SLOT_COUNT, "Save 6");

    const slots = settingsStore.getSlots();
    expect(slots).toHaveLength(SLOT_COUNT + 1);
    expect(slots.at(-1)?.name).toMatch(/^Save\s+\d+$/);
  });

  it("removes cleared saves instead of leaving empty placeholders", async () => {
    const { settingsStore, SLOT_COUNT } = await import("./store");

    settingsStore.clearSlot(1);

    const slots = settingsStore.getSlots();
    expect(slots).toHaveLength(SLOT_COUNT - 1);
    expect(slots.every((slot) => slot != null)).toBe(true);
  });

  it("reindexes auto-generated slot names after deleting a slot", async () => {
    const { settingsStore } = await import("./store");

    settingsStore.clearSlot(1);

    const names = settingsStore.getSlots().map((slot) => slot.name);
    expect(names[0]).toBe("Slot 1");
    expect(names[1]).toBe("Slot 2");
    expect(names[2]).toMatch(/^Save\s+\d+$/);
    expect(names).not.toContain("Slot 3");
  });

  it("keeps custom save names while reindexing generated save names", async () => {
    const { settingsStore, SLOT_COUNT } = await import("./store");

    settingsStore.saveSlot(0, "My Favorite");
    settingsStore.saveSlot(SLOT_COUNT, "Save 6");
    settingsStore.clearSlot(1);

    const names = settingsStore.getSlots().map((slot) => slot.name);
    expect(names).toHaveLength(SLOT_COUNT);
    expect(names[0]).toBe("My Favorite");
    expect(new Set(names).size).toBe(names.length);
    expect(names.slice(1).every((name) => /^(Slot|Save)\s+\d+$/.test(name))).toBe(true);
  });
});
