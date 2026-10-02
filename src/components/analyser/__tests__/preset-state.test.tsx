import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { usePresetActions, type PresetActions } from "../hooks/usePresetActions";
import { settingsStore as store } from "../store";
import { installStorageMock } from "./helpers/test-helpers";

describe("shared preset actions", () => {
  let root: Root;
  let container: HTMLDivElement;
  let toolbar: PresetActions;
  let panel: PresetActions;
  function Harness() {
    toolbar = usePresetActions();
    panel = usePresetActions();
    return null;
  }
  beforeEach(() => {
    installStorageMock();
    while (store.getSlots().length) store.clearSlot(0);
    store.reset();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    flushSync(() => root.render(<Harness />));
  });
  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it("blocks duplicate saves immediately, then enables saving after an edit", () => {
    flushSync(() => {
      expect(toolbar.saveNew().status).toBe("ok");
      expect(toolbar.saveNew().status).toBe("unchanged");
    });
    expect(store.getSlots()).toHaveLength(1);
    expect(toolbar.canSaveNew).toBe(false);
    expect(panel.currentSaveIndex).toBe(0);
    flushSync(() => store.set({ gain: 2 }));
    expect(toolbar.canSaveNew).toBe(true);
    expect(toolbar.deleteCurrent().status).toBe("empty");
    expect(store.getSlots()).toHaveLength(1);
  });

  it("deletes the displayed save, regardless of either panel's focus", () => {
    flushSync(() => {
      toolbar.saveNew();
      store.set({ gain: 2 });
      toolbar.saveNew();
    });
    flushSync(() => {
      panel.focus(0);
      store.loadSlot(1);
    });
    expect(toolbar.currentSaveIndex).toBe(1);
    expect(panel.activeIndex).toBe(0);
    flushSync(() => toolbar.deleteCurrent());
    expect(store.getSlots()).toHaveLength(1);
    expect(store.getSlots()[0].settings.gain).toBe(1);
    expect(toolbar.currentSaveIndex).toBe(-1);
  });

  it("navigates from externally loaded saves and stops automatic cycling", () => {
    flushSync(() => {
      toolbar.saveNew();
      store.set({ gain: 2 });
      toolbar.saveNew();
      store.set({ gain: 3 });
      toolbar.saveNew();
      store.loadSlot(0);
      store.set({ slotCycleMode: true });
    });
    flushSync(() => toolbar.step(1, { load: true }));
    expect(store.get().gain).toBe(2);
    expect(store.get().slotCycleMode).toBe(false);
    expect(toolbar.currentSaveIndex).toBe(1);
  });

  it("can load a single save from an edited look, but cannot navigate away from that save", () => {
    expect(toolbar.canLoadAnother).toBe(false);
    flushSync(() => toolbar.saveNew());
    expect(toolbar.canLoadAnother).toBe(false);
    flushSync(() => store.set({ gain: 2 }));
    expect(toolbar.canLoadAnother).toBe(true);
    flushSync(() => toolbar.step(1, { load: true }));
    expect(store.get().gain).toBe(1);
    expect(toolbar.canLoadAnother).toBe(false);
  });
});
