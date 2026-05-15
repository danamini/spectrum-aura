import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shortcuts } from "./Shortcuts";

type Slot = { name: string; settings: Record<string, unknown> } | null;

type MockState = {
  view: "combo";
  comboFullscreen: boolean;
  slotCycleMode: boolean;
};

const mocks = vi.hoisted(() => {
  const state: MockState = {
    view: "combo",
    comboFullscreen: false,
    slotCycleMode: false,
  };

  const slots: Slot[] = [{ name: "Slot 1", settings: { view: "combo" } }, null, null, null, null];

  return {
    state,
    slots,
    settingsStore: {
      randomize: vi.fn(),
      get: vi.fn(() => state),
      set: vi.fn((patch: Partial<MockState>) => {
        Object.assign(state, patch);
      }),
      getSlots: vi.fn(() => slots),
      loadSlot: vi.fn(),
      saveSlot: vi.fn(),
    },
  };
});

vi.mock("./store", () => ({
  settingsStore: mocks.settingsStore,
  useSettings: () => mocks.state,
  useSlots: () => mocks.slots,
}));

describe("Shortcuts", () => {
  let container: HTMLDivElement;
  let root: Root;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.state.view = "combo";
    mocks.state.comboFullscreen = false;
    mocks.state.slotCycleMode = false;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    flushSync(() => {
      root.render(<Shortcuts />);
    });
    await tick();
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  it("renders the updated shortcut labels", () => {
    expect(container.textContent).toContain("Cycle Visual");
    expect(container.textContent).toContain("Auto Cycle Saves");
    expect(container.textContent).toContain("Stats");
    expect(container.textContent).toContain("Source");
  });

  it("dispatches settings toggle event when clicking Settings shortcut", () => {
    const onToggleSettings = vi.fn();
    window.addEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);

    const settingsButton = container.querySelector("button[title='Press S']");
    expect(settingsButton).not.toBeNull();

    settingsButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onToggleSettings).toHaveBeenCalledTimes(1);
    window.removeEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);
  });

  it("allows S key to toggle settings even while typing in an input", () => {
    const onToggleSettings = vi.fn();
    window.addEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));

    expect(onToggleSettings).toHaveBeenCalledTimes(1);

    input.remove();
    window.removeEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);
  });

  it("uses A key for Auto Cycle Saves", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ slotCycleMode: true });
  });

  it("shows XR-friendly shortcut buttons without keyboard legends when VR is active", async () => {
    window.dispatchEvent(
      new CustomEvent("spectrum-aura:webxr-state", {
        detail: {
          available: true,
          active: true,
          pending: false,
          error: null,
          backgroundHidden: false,
        },
      }),
    );
    await tick();

    expect(container.querySelector("kbd")).toBeNull();
    expect(container.textContent).toContain("Exit VR");
  });
});
