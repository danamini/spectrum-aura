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
