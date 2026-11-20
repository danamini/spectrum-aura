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
  visualResponse: number;
  autoBalanceEnabled: boolean;
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
    visualResponse: 1,
    autoBalanceEnabled: false,
  };

  const slots: Slot[] = [
    { name: "Slot 1", settings: { view: "combo" } },
    { name: "Slot 2", settings: { view: "classic" } },
  ];

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
      getCurrentSaveIndex: vi.fn(() => -1),
      loadSlot: vi.fn(),
      saveSlot: vi.fn(),
      clearSlot: vi.fn(),
    },
  };
});

vi.mock("../store", () => ({
  DEFAULT_SETTINGS: { autoBalanceEnabled: true },
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
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    mocks.settingsStore.getCurrentSaveIndex.mockReturnValue(-1);
    mocks.state.view = "combo";
    mocks.state.comboFullscreen = false;
    mocks.state.slotCycleMode = false;
    mocks.state.viewCycleMode = false;
    mocks.state.randomizeViewSettings = false;
    mocks.state.postFxEnabled = true;
    mocks.state.showBPM = true;
    mocks.state.showLatency = false;
    mocks.state.visualResponse = 1;
    mocks.state.autoBalanceEnabled = false;

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
    vi.unstubAllGlobals();
  });

  it("adjusts response with arrow keys without changing visuals", () => {
    const slider = container.querySelector<HTMLElement>('[role="slider"]')!;
    slider.focus();
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(mocks.settingsStore.set).toHaveBeenCalledTimes(1);
    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ visualResponse: 1.04 });
  });

  it("offers automatic balance and disables the neutral response reset", () => {
    expect(
      container.querySelector<HTMLButtonElement>('button[aria-label="Reset response to 1×"]')
        ?.disabled,
    ).toBe(true);
    const toggle = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Auto balance",
    )!;
    toggle.click();
    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ autoBalanceEnabled: true });
  });

  it("uses minus and plus for calm/punchy response and clamps at the limits", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    expect(mocks.state.visualResponse).toBe(0.97);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
    expect(mocks.state.visualResponse).toBe(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "=", bubbles: true }));
    expect(mocks.state.visualResponse).toBe(1.04);
    mocks.state.visualResponse = 4;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", bubbles: true }));
    expect(mocks.state.visualResponse).toBe(4);
    mocks.state.visualResponse = 0.25;
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    expect(mocks.state.visualResponse).toBe(0.25);
  });

  it("leaves typing and browser zoom alone for response shortcuts", () => {
    const input = document.createElement("input");
    container.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "-", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "+", ctrlKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "-", metaKey: true, bubbles: true }));
    expect(mocks.settingsStore.set).not.toHaveBeenCalled();
  });

  it("keeps the auto balance explanation visible through live status updates", async () => {
    const toggle = [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "Auto balance",
    )!;
    toggle.focus();
    await tick();
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(
      "Gradually adjusts brightness",
    );
    flushSync(() =>
      window.dispatchEvent(
        new CustomEvent("spectrum-aura:balance-state", {
          detail: { status: "balanced", exposure: 1.1, response: 1, sampleMs: 2 },
        }),
      ),
    );
    expect(document.activeElement).toBe(toggle);
    expect(document.querySelector('[role="tooltip"]')?.textContent).toContain(
      "Performance Mode and VR",
    );
  });

  it("keeps the toolbar to what is used while music plays", () => {
    const text = container.textContent ?? "";
    for (const label of [
      "Next Visual",
      "Randomize",
      "Play Presets",
      "Save Preset",
      "Settings",
      "Search",
      "Keys",
      "Hide",
    ]) {
      expect(text).toContain(label);
    }
    // Displays and one-off actions live in menus, the panel and the palette.
    for (const label of ["BPM Grid", "Latency", "Stats", "View Cycle", "Random Save", "Delete"]) {
      expect(text).not.toContain(label);
    }
  });

  it("offers the input picker only while nothing is playing", async () => {
    expect(container.textContent).toContain("Input Source");
    flushSync(() =>
      window.dispatchEvent(
        new CustomEvent("spectrum-aura:audio-source-state", { detail: { source: "mic" } }),
      ),
    );
    await tick();
    expect(container.textContent).not.toContain("Input Source");
  });

  it("offers Beat Tap only while a source is playing and tempo has not locked", async () => {
    expect(container.textContent).not.toContain("Beat Tap");
    flushSync(() =>
      window.dispatchEvent(
        new CustomEvent("spectrum-aura:audio-source-state", { detail: { source: "mic" } }),
      ),
    );
    await tick();
    expect(container.textContent).toContain("Beat Tap");
    flushSync(() =>
      window.dispatchEvent(
        new CustomEvent("spectrum-aura:live-tempo", {
          detail: { barTiming: { bpmLocked: true } },
        }),
      ),
    );
    await tick();
    expect(container.textContent).not.toContain("Beat Tap");
  });

  it("keeps a focused tooltip open through live FPS updates", async () => {
    const button = container.querySelector<HTMLButtonElement>("button[aria-label='Randomize']")!;
    button.focus();
    await tick();
    expect(document.querySelector('[role="tooltip"]')).not.toBeNull();

    for (const fps of [60, 59, 61]) {
      flushSync(() => {
        window.dispatchEvent(new CustomEvent("spectrum-aura:frame-stats", { detail: { fps } }));
      });
      await tick();
      expect(container.querySelector("button[aria-label='Randomize']")).toBe(button);
      expect(document.activeElement).toBe(button);
      expect(document.querySelector('[role="tooltip"]')).not.toBeNull();
    }
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

  it("toggles all effects with P", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "p", bubbles: true }));
    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ postFxEnabled: false });
  });

  it("renders icons for the save shortcut controls", () => {
    const saveShortcuts = Array.from(container.querySelectorAll("button")).filter((button) => {
      const text = button.textContent ?? "";
      return ["Play Presets", "Prev Preset", "Next Preset", "Save Preset"].some((label) =>
        text.includes(label),
      );
    });

    expect(saveShortcuts.length).toBeGreaterThan(0);
    expect(saveShortcuts.every((button) => button.querySelector("svg") !== null)).toBe(true);
  });

  it("opens the matching section from the group titles and Settings button", () => {
    const tabs: (string | null)[] = [];
    const listener = (e: Event) => {
      tabs.push((e as CustomEvent<{ tab?: string }>).detail?.tab ?? null);
    };
    window.addEventListener("spectrum-aura:toggle-settings-panel", listener);

    const click = () => new MouseEvent("click", { bubbles: true });
    container.querySelector("button[aria-label='Open the presets']")?.dispatchEvent(click());
    container
      .querySelector('button[aria-label="Open the view picker and this view\'s settings"]')
      ?.dispatchEvent(click());
    container.querySelector("button[aria-label='Settings']")?.dispatchEvent(click());

    window.removeEventListener("spectrum-aura:toggle-settings-panel", listener);
    // Looks title → Looks, Visuals title → View, Settings → wherever it was last.
    expect(tabs).toEqual(["saves", "view", null]);
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

  it("never runs a shortcut while typing in a text field", () => {
    const onToggleSettings = vi.fn();
    window.addEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    for (const key of ["s", "r", " ", "ArrowLeft", "1", "?"]) {
      input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }
    expect(onToggleSettings).not.toHaveBeenCalled();
    expect(mocks.settingsStore.randomize).not.toHaveBeenCalled();
    expect(mocks.settingsStore.set).not.toHaveBeenCalled();
    input.remove();
    window.removeEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);
  });

  it("lets S open settings from a focused slider, which has no use for the letter", () => {
    const onToggleSettings = vi.fn();
    window.addEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);
    const slider = container.querySelector<HTMLElement>('[role="slider"]')!;
    slider.dispatchEvent(new KeyboardEvent("keydown", { key: "s", bubbles: true }));
    expect(onToggleSettings).toHaveBeenCalledTimes(1);
    window.removeEventListener("spectrum-aura:toggle-settings-panel", onToggleSettings);
  });

  it("uses the taught keys: Space, arrows, H, I, D, ? and /", () => {
    const press = (key: string, init: KeyboardEventInit = {}) =>
      window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init }));
    press(" ");
    expect(mocks.settingsStore.set).toHaveBeenCalledWith({
      slotCycleMode: true,
      viewCycleMode: false,
    });
    press("d");
    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ evolveEnabled: true });

    const seen: string[] = [];
    const note = (name: string) => () => seen.push(name);
    const listeners: Array<[string, () => void]> = [
      ["spectrum-aura:open-help", note("help")],
      ["spectrum-aura:open-palette", note("palette")],
      ["spectrum-aura:stop-audio", note("input")],
    ];
    for (const [event, fn] of listeners) window.addEventListener(event, fn);
    press("?", { shiftKey: true });
    press("/");
    press("i");
    for (const [event, fn] of listeners) window.removeEventListener(event, fn);
    expect(seen).toEqual(["help", "palette", "input"]);
  });

  it("loads looks 1 to 9 on the digits", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", code: "Digit2", bubbles: true }));
    expect(mocks.settingsStore.loadSlot).toHaveBeenCalledWith(1);
  });

  it("saves over a preset with Shift and a digit key", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "!", code: "Digit1", shiftKey: true, bubbles: true }),
    );
    expect(mocks.settingsStore.saveSlot).toHaveBeenCalledWith(0, undefined);
  });

  it("opens search, not a save, where Shift+7 types a slash", () => {
    const opened = vi.fn();
    window.addEventListener("spectrum-aura:open-palette", opened);
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "/", code: "Digit7", shiftKey: true, bubbles: true }),
    );
    window.removeEventListener("spectrum-aura:open-palette", opened);
    expect(opened).toHaveBeenCalledTimes(1);
    expect(mocks.settingsStore.saveSlot).not.toHaveBeenCalled();
  });

  it("loads, not saves, where a digit needs Shift to type", () => {
    window.dispatchEvent(
      new KeyboardEvent("keydown", { key: "1", code: "Digit1", shiftKey: true, bubbles: true }),
    );
    expect(mocks.settingsStore.loadSlot).toHaveBeenCalledWith(0);
    expect(mocks.settingsStore.saveSlot).not.toHaveBeenCalled();
  });

  it("leaves the scene alone while the palette or key sheet is open", () => {
    const modal = document.createElement("div");
    modal.setAttribute("data-blocks-shortcuts", "palette");
    document.body.appendChild(modal);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "2", code: "Digit2", bubbles: true }));
    modal.remove();
    expect(mocks.settingsStore.randomize).not.toHaveBeenCalled();
    expect(mocks.settingsStore.loadSlot).not.toHaveBeenCalled();
  });

  it("runs an action sent by the palette or cheat sheet", () => {
    window.dispatchEvent(new CustomEvent("spectrum-aura:run-action", { detail: "randomize" }));
    expect(mocks.settingsStore.randomize).toHaveBeenCalledTimes(1);
  });

  it("does not steal Space from a focused button", () => {
    const button = container.querySelector<HTMLButtonElement>("button[aria-label='Randomize']")!;
    button.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(mocks.settingsStore.set).not.toHaveBeenCalled();
  });

  it("uses A key for Play Saves", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({
      slotCycleMode: true,
      viewCycleMode: false,
    });
  });

  it("uses C key for View Cycle", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "c", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({
      viewCycleMode: true,
      slotCycleMode: false,
    });
  });

  it("uses M key for BPM grid toggle", () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ showBPM: false });
  });

  it("toggles BPM grid from the Displays menu", () => {
    flushSync(() => {
      container
        .querySelector("button[aria-label='Displays']")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    const bpmButton = container.querySelector("button[aria-label='BPM Grid']");
    expect(bpmButton).not.toBeNull();

    bpmButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(mocks.settingsStore.set).toHaveBeenCalledWith({ showBPM: false });
  });

  it("toggles latency HUD from the Displays menu", () => {
    flushSync(() => {
      container
        .querySelector("button[aria-label='Displays']")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
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

  it("hides the toolbar with H (or the older G) and shows the restore pill", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "h", bubbles: true }));
    await tick();

    expect(container.textContent).not.toContain("Randomize");
    expect(container.textContent).toContain("controls · h");

    const restore = container.querySelector("button[title='Show controls (H)']");
    restore?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await tick();
    expect(container.textContent).toContain("Randomize");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    await tick();
    expect(container.textContent).not.toContain("Randomize");
  });

  it("dims the restore pill when the mouse leaves the window and brightens on return", async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "g", bubbles: true }));
    await tick();

    const restore = container.querySelector(
      "button[title='Show controls (H)']",
    ) as HTMLButtonElement | null;
    expect(restore?.dataset.windowHovering).toBe("true");

    document.documentElement.dispatchEvent(new MouseEvent("mouseleave", { bubbles: true }));
    await tick();
    expect(restore?.dataset.windowHovering).toBe("false");

    window.dispatchEvent(new MouseEvent("mousemove", { bubbles: true }));
    await tick();
    expect(restore?.dataset.windowHovering).toBe("true");
  });

  it("marks Pause Presets as active when the looks are playing", async () => {
    mocks.state.slotCycleMode = true;

    flushSync(() => {
      root.render(<Shortcuts />);
    });
    await tick();

    const playSavesButton = container.querySelector("button[aria-label='Pause Presets']");
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

  it("disables Save for a look that is already saved", () => {
    mocks.settingsStore.getCurrentSaveIndex.mockReturnValue(0);
    flushSync(() => root.render(<Shortcuts />));
    const save = container.querySelector<HTMLButtonElement>("button[aria-label='Save']")!;
    expect(save.textContent).toContain("Saved");
    expect(save.getAttribute("aria-disabled")).toBe("true");
    save.click();
    expect(mocks.settingsStore.saveSlot).not.toHaveBeenCalled();
  });

  it("renders FPS as a readout in the Displays menu, not an action", () => {
    flushSync(() => {
      container
        .querySelector("button[aria-label='Displays']")
        ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    flushSync(() =>
      window.dispatchEvent(new CustomEvent("spectrum-aura:frame-stats", { detail: { fps: 60 } })),
    );
    expect(
      container.querySelector("output[title='Live rendering frame rate']")?.textContent,
    ).toContain("60");
    expect(container.querySelector("button[title*='FPS']")).toBeNull();
  });

  it("lets a resize handle own its arrow keys", () => {
    const handle = document.createElement("button");
    handle.setAttribute("data-own-arrow-keys", "");
    document.body.append(handle);
    handle.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    expect(mocks.settingsStore.set).not.toHaveBeenCalled();
    handle.remove();
  });
});
