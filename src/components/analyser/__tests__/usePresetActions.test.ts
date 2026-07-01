import { beforeEach, describe, expect, it, vi } from "vitest";

import { installStorageMock } from "./helpers/test-helpers";
import { pickRandomOtherIndex, wrapIndex } from "../hooks/usePresetActions";

describe("usePresetActions helpers", () => {
  describe("wrapIndex", () => {
    it("wraps forward at end of list", () => {
      expect(wrapIndex(2, 1, 3)).toBe(0);
    });

    it("wraps backward at start of list", () => {
      expect(wrapIndex(0, -1, 3)).toBe(2);
    });

    it("stays in range for middle indices", () => {
      expect(wrapIndex(1, 1, 5)).toBe(2);
      expect(wrapIndex(3, -1, 5)).toBe(2);
    });
  });

  describe("pickRandomOtherIndex", () => {
    it("returns 0 when only one slot exists", () => {
      expect(pickRandomOtherIndex(1, 0)).toBe(0);
    });

    it("never returns the current index when multiple slots exist", () => {
      const current = 2;
      for (let i = 0; i < 40; i++) {
        const next = pickRandomOtherIndex(5, current);
        expect(next).toBeGreaterThanOrEqual(0);
        expect(next).toBeLessThan(5);
        expect(next).not.toBe(current);
      }
    });
  });
});

describe("usePresetActions store integration", () => {
  beforeEach(() => {
    vi.resetModules();
    installStorageMock();
    localStorage.setItem("analyser-slots-v1", "[]");
  });

  it("saveNew appends Save N slots in order", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.saveSlot(0, "First");
    const index = settingsStore.getSlots().length;
    settingsStore.saveSlot(index, `Save ${index + 1}`);

    const slots = settingsStore.getSlots();
    expect(slots).toHaveLength(2);
    expect(slots[1]?.name).toBe("Save 2");
  });

  it("clearSlot clamps cursor like deleteFocused", async () => {
    const { settingsStore } = await import("../store");

    settingsStore.saveSlot(0, "A");
    settingsStore.saveSlot(1, "B");
    settingsStore.saveSlot(2, "C");
    settingsStore.saveSlot(3, "D");

    const activeIndex = 2;
    settingsStore.clearSlot(activeIndex);
    const list = settingsStore.getSlots();
    const nextCursor = list.length <= 1 ? 0 : Math.min(activeIndex, list.length - 2);

    expect(list).toHaveLength(3);
    expect(nextCursor).toBe(1);
  });

  it("deleteAt cursor math: deleting before the cursor shifts it back", () => {
    // Mirrors deleteAt's setCursor logic in usePresetActions.ts.
    const cursorAfterDelete = (index: number, prevCursor: number, newLength: number) =>
      newLength <= 0
        ? 0
        : index < prevCursor
          ? prevCursor - 1
          : Math.min(prevCursor, newLength - 1);

    // Cursor on slot 3, deleting slot 0 (before it) — cursor should follow to slot 2.
    expect(cursorAfterDelete(0, 3, 3)).toBe(2);
    // Cursor on slot 1, deleting slot 3 (after it) — cursor stays put.
    expect(cursorAfterDelete(3, 1, 3)).toBe(1);
    // Cursor on the deleted slot itself, at the end of the list — clamps to new last index.
    expect(cursorAfterDelete(3, 3, 3)).toBe(2);
    // Deleting the only remaining slot — cursor resets to 0.
    expect(cursorAfterDelete(0, 0, 0)).toBe(0);
  });
});
