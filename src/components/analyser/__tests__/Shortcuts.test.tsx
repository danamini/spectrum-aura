import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Shortcuts } from "../Shortcuts";

type Slot = { name: string; settings: Record<string, unknown> } | null;

type MockState = {
  view: "combo";
  comboFullscreen: boolean;
  slotCycleMode: boolean;
  viewCycleMode: boolean;
  randomizeViewSettings: boolean;
  postFxEnabled: boolean;
  showBPM: boolean;
  showLatency: boolean;
};

const mocks = vi.hoisted(() => {
  const state: MockState = {
    view: "combo",
    comboFullscreen: false,
    slotCycleMode: false,
    viewCycleMode: false,
    randomizeViewSettings: false,
    postFxEnabled: true,
    showBPM: true,
    showLatency: false,
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
      clearSlot: vi.fn(),
    },
  };
});

vi.mock("../store", () => ({
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
    mocks.state.viewCycleMode = false;
    mocks.state.randomizeViewSettings = false;
    mocks.state.postFxEnabled = true;
    mocks.state.showBPM = true;
    mocks.state.showLatency = false;

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
    expect(container.textContent).toContain("Next Visual");
    expect(container.textContent).toContain("Play Saves");
    expect(container.textContent).toContain("Stats");
    expect(container.textContent).toContain("Audio Source");
    expect(container.textContent).toContain("BPM Grid");
    expect(container.textContent).toContain("Latency");
    expect(container.textContent).toContain("Beat Tap");
    expect(container.textContent).toContain("Hide All");
  });

  it("shows the current visual name in the header and a view count in the visual cluster", () => {
    // Visual name label above the rows
    expect(container.textContent).toContain("Combo");
    // View count badge inside the visual cluster (e.g. "12 views")
    expect(container.textContent).toMatch(/\d+ visuals?/);
  });

  it("renders a Prev Visual button in the visual cluster", () => {
    const prevButton = container.querySelector("button[aria-label='Prev Visual']");
    expect(prevButton).not.toBeNull();
  });

  it("navigates forward with V key and backward with B key", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "v", bubbles: true }));
    expect(mocks.settingsStore.set).toHaveBeenCalledTimes(1);
    const firstCall = mocks.settingsStore.set.mock.calls[0][0] as Record<string, unknown>;
    expect(firstCall).toHaveProperty("view");

    vi.clearAllMocks();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
    expect(mocks.settingsStore.set).toHaveBeenCalledTimes(1);
    const secondCall = mocks.settingsStore.set.mock.calls[0][0] as Record<string, unknown>;
    expect(secondCall).toHaveProperty("view");
  });

  it("navigates forward with ArrowRight and backward with ArrowLeft", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(mocks.settingsStore.set).toHaveBeenCalledTimes(1);
    const firstCall = mocks.settingsStore.set.mock.calls[0][0] as Record<string, unknown>;
    expect(firstCall).toHaveProperty("view");

    vi.clearAllMocks();

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true }));
    expect(mocks.settingsStore.set).toHaveBeenCalledTimes(1);
    const secondCall = mocks.settingsStore.set.mock.calls[0][0] as Record<string, unknown>;
    expect(secondCall).toHaveProperty("view");
  });

  it("shows arrow keys as the primary Prev/Next Visual legend", () => {
    const prevButton = container.querySelector("button[aria-label='Prev Visual']");
    const nextButton = container.querySelector("button[aria-label='Next Visual']");
    expect(prevButton?.querySelector("kbd")?.textContent).toBe("←");
    expect(nextButton?.querySelector("kbd")?.textContent).toBe("→");
  });

  it("cycles saves with Shift+ArrowRight and Shift+ArrowLeft as aliases for ] and [", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", shiftKey: true, bubbles: true }),
    );
    expect(mocks.settingsStore.getSlots).toHaveBeenCalled();

    vi.clearAllMocks();

    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowLeft", shiftKey: true, bubbles: true }),
    );
    expect(mocks.settingsStore.getSlots).toHaveBeenCalled();
  });

  it("triggers randomize with R key", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    expect(mocks.settingsStore.randomize).toHaveBeenCalledTimes(1);
  });

  it("navigates to prev visual when Prev Visual button is clicked", () => {
    const prevButton = container.querySelector("button[aria-label='Prev Visual']");
    expect(prevButton).not.toBeNull();
    prevButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(mocks.settingsStore.set).toHaveBeenCalledWith(
      expect.objectContaining({ view: expect.any(String) }),
    );
  });

  it("renders subtle randomize toggles for include and post fx", () => {
    expect(container.textContent).toContain("inc");
    expect(container.textContent).toContain("fx");
  });

  it("toggles randomize include scope from the shortcut bar", () => {
    const includeToggle = container.querySelector("button[aria-label='Randomize post FX only']");
    expect(includeToggle).not.toBeNull();

    includeToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ randomizeViewSettings: true });
  });

  it("toggles post fx from the shortcut bar", () => {
    const postFxToggle = container.querySelector("button[aria-label='Post FX enabled']");
    expect(postFxToggle).not.toBeNull();

    postFxToggle?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ postFxEnabled: false });
  });

  it("renders icons for the save shortcut controls", () => {
    const saveShortcuts = Array.from(container.querySelectorAll("button")).filter((button) => {
      const text = button.textContent ?? "";
      return ["Play Saves", "Prev Save", "Next Save", "Random Save", "Save", "Delete"].some(
        (label) => text.includes(label),
      );
    });

    expect(saveShortcuts.length).toBeGreaterThan(0);
    expect(saveShortcuts.every((button) => button.querySelector("svg") !== null)).toBe(true);
  });

  it("dispatches settings toggle event when clicking Settings shortcut", () => {
    const onToggleSettings = vi.fn();
    window.addEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);

    const settingsButton = container.querySelector("button[aria-label='Settings']");
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

  it("uses A key for Play Saves", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ slotCycleMode: true });
  });

  it("uses C key for View Cycle", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ viewCycleMode: true });
  });

  it("uses M key for BPM grid toggle", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ showBPM: false });
  });

  it("toggles BPM grid from the shortcut bar", () => {
    const bpmButton = container.querySelector("button[aria-label='BPM Grid']");
    expect(bpmButton).not.toBeNull();

    bpmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ showBPM: false });
  });

  it("toggles latency HUD from the shortcut bar", () => {
    const latencyButton = container.querySelector("button[aria-label='Latency']");
    expect(latencyButton).not.toBeNull();

    latencyButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ showLatency: true });
  });

  it("uses L key for latency HUD toggle", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "l", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ showLatency: true });
  });

  it("uses N key for stats panel", () => {
    const onToggleStats = vi.fn();
    window.addEventListener("spectrum-aura:toggle-stats-panel", onToggleStats);

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "n", bubbles: true }));

    expect(onToggleStats).toHaveBeenCalledTimes(1);
    window.removeEventListener("spectrum-aura:toggle-stats-panel", onToggleStats);
  });

  it("hides the shortcut bar with G and shows the restore pill", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    await tick();

    expect(container.textContent).not.toContain("BPM Grid");
    expect(container.textContent).toContain("shortcuts");

    const restore = container.querySelector("button[title='Show shortcuts (G)']");
    restore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();

    expect(container.textContent).toContain("BPM Grid");
  });

  it("dims the restore pill when the mouse leaves the window and brightens on return", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    await tick();

    const restore = container.querySelector(
      "button[title='Show shortcuts (G)']",
    ) as HTMLButtonElement | null;
    expect(restore?.dataset.windowHovering).toBe("true");

    document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    await tick();
    expect(restore?.dataset.windowHovering).toBe("false");

    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await tick();
    expect(restore?.dataset.windowHovering).toBe("true");
  });

  it("marks View Cycle as active when view cycling is enabled", async () => {
    mocks.state.viewCycleMode = true;

    flushSync(() => {
      root.render(<Shortcuts />);
    });
    await tick();

    const viewCycleButton = container.querySelector("button[aria-label='View Cycle']");
    expect(viewCycleButton?.getAttribute("aria-pressed")).toBe("true");
  });

  it("marks Play Saves as active when save cycling is enabled", async () => {
    mocks.state.slotCycleMode = true;

    flushSync(() => {
      root.render(<Shortcuts />);
    });
    await tick();

    const playSavesButton = container.querySelector("button[aria-label='Play Saves']");
    expect(playSavesButton?.getAttribute("aria-pressed")).toBe("true");
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

  it("deletes the focused save from the shortcut bar", () => {
    const deleteButton = Array.from(container.querySelectorAll("button")).find((button) =>
      (button.textContent ?? "").includes("Delete"),
    );

    expect(deleteButton).not.toBeNull();

    deleteButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mocks.settingsStore.clearSlot).toHaveBeenCalledWith(0);
  });
});
