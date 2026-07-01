import { useEffect, useState } from "react";
import { settingsStore, useSlots, type SavedSlot } from "../store";

/**
 * Result of a preset action, so callers can render their own feedback (e.g.
 * the shortcut-bar flash) without re-implementing the underlying logic.
 */
export type PresetActionResult =
  | { status: "ok"; index: number; name: string }
  | { status: "empty" }
  | { status: "missing"; index: number };

/** Pick a random slot index that differs from `current` (or 0 when only one). */
export function pickRandomOtherIndex(length: number, current: number): number {
  if (length <= 1) return 0;
  let index = current;
  while (index === current) index = Math.floor(Math.random() * length);
  return index;
}

/** Wrap a slot index by `dir`, staying within `[0, length)`. */
export function wrapIndex(current: number, dir: 1 | -1, length: number): number {
  return (current + dir + length) % length;
}

export type PresetActions = {
  slots: SavedSlot[];
  hasPresets: boolean;
  /** Cursor clamped to the current slot list. */
  activeIndex: number;
  /** Move the cursor without loading. */
  focus: (index: number) => void;
  /** Load the slot at `index` and move the cursor to it. */
  loadAt: (index: number) => PresetActionResult;
  /** Load the currently focused slot. */
  loadFocused: () => PresetActionResult;
  /** Step the cursor by `dir`; optionally load the resulting slot. */
  step: (dir: 1 | -1, opts?: { load?: boolean }) => PresetActionResult;
  /** Jump to a random other slot; optionally load it. */
  random: (opts?: { load?: boolean }) => PresetActionResult;
  /** Save current settings to `index` under `name`. */
  saveAt: (index: number, name: string) => PresetActionResult;
  /** Append current settings as a new `Save N` slot. */
  saveNew: () => PresetActionResult;
  /** Overwrite the focused slot (or append when none exist). */
  saveFocused: () => PresetActionResult;
  /** Delete the focused slot and keep the cursor in range. */
  deleteFocused: () => PresetActionResult;
  /** Delete the slot at `index` regardless of focus, adjusting the cursor to stay valid. */
  deleteAt: (index: number) => PresetActionResult;
};

/**
 * Single source of truth for the load / save / step / random / delete preset
 * workflow shared by the control panel and the shortcut bar. The cursor lives
 * here; callers decide whether stepping/randomizing also loads.
 */
export function usePresetActions(): PresetActions {
  const slots = useSlots();
  const [cursor, setCursor] = useState(0);
  const hasPresets = slots.length > 0;
  const activeIndex = hasPresets ? Math.min(cursor, slots.length - 1) : 0;

  useEffect(() => {
    setCursor((prev) => (slots.length === 0 ? 0 : Math.min(prev, slots.length - 1)));
  }, [slots.length]);

  const slotResult = (list: SavedSlot[], index: number): PresetActionResult => {
    const slot = list[index];
    return slot ? { status: "ok", index, name: slot.name } : { status: "missing", index };
  };

  const focus = (index: number) => {
    const list = settingsStore.getSlots();
    if (index < 0 || index >= list.length) return;
    setCursor(index);
  };

  const loadAt = (index: number): PresetActionResult => {
    const list = settingsStore.getSlots();
    const slot = list[index];
    if (!slot) return { status: "missing", index };
    setCursor(index);
    settingsStore.loadSlot(index);
    return { status: "ok", index, name: slot.name };
  };

  const loadFocused = (): PresetActionResult => {
    if (!hasPresets) return { status: "empty" };
    return loadAt(activeIndex);
  };

  const step = (dir: 1 | -1, opts?: { load?: boolean }): PresetActionResult => {
    const list = settingsStore.getSlots();
    if (list.length === 0) return { status: "empty" };
    const next = wrapIndex(activeIndex, dir, list.length);
    if (opts?.load) return loadAt(next);
    focus(next);
    return slotResult(list, next);
  };

  const random = (opts?: { load?: boolean }): PresetActionResult => {
    const list = settingsStore.getSlots();
    if (list.length === 0) return { status: "empty" };
    const next = pickRandomOtherIndex(list.length, activeIndex);
    if (opts?.load) return loadAt(next);
    focus(next);
    return slotResult(list, next);
  };

  const saveAt = (index: number, name: string): PresetActionResult => {
    settingsStore.saveSlot(index, name);
    setCursor(index);
    return { status: "ok", index, name };
  };

  const saveNew = (): PresetActionResult => {
    const index = settingsStore.getSlots().length;
    return saveAt(index, `Save ${index + 1}`);
  };

  const saveFocused = (): PresetActionResult => {
    if (!hasPresets) return saveNew();
    const list = settingsStore.getSlots();
    const name = list[activeIndex]?.name ?? `Save ${activeIndex + 1}`;
    return saveAt(activeIndex, name);
  };

  const deleteFocused = (): PresetActionResult => {
    const list = settingsStore.getSlots();
    if (list.length === 0) return { status: "empty" };
    const removed = list[activeIndex];
    settingsStore.clearSlot(activeIndex);
    setCursor(list.length <= 1 ? 0 : Math.min(activeIndex, list.length - 2));
    return removed
      ? { status: "ok", index: activeIndex, name: removed.name }
      : { status: "missing", index: activeIndex };
  };

  const deleteAt = (index: number): PresetActionResult => {
    const list = settingsStore.getSlots();
    const slot = list[index];
    if (!slot) return { status: "missing", index };
    settingsStore.clearSlot(index);
    const newLength = list.length - 1;
    setCursor((prev) => {
      if (newLength <= 0) return 0;
      if (index < prev) return prev - 1;
      return Math.min(prev, newLength - 1);
    });
    return { status: "ok", index, name: slot.name };
  };

  return {
    slots,
    hasPresets,
    activeIndex,
    focus,
    loadAt,
    loadFocused,
    step,
    random,
    saveAt,
    saveNew,
    saveFocused,
    deleteFocused,
    deleteAt,
  };
}
