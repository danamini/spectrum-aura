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
        null,
        null,
        null,
        null,
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
});
