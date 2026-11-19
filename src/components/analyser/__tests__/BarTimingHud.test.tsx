import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  EMPTY_LIVE_TEMPO,
  setLiveTempoFrame,
  type LiveTempoState,
} from "@spectrum-aura/engine/live-tempo";
import { BarTimingHud, BpmLockIndicator } from "../BarTimingHud";

describe("BpmLockIndicator", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
  });

  const render = (props: {
    bpm: number;
    confidence: number;
    locked: boolean;
    beatPhase: number;
  }) => {
    flushSync(() => {
      root.render(<BpmLockIndicator {...props} />);
    });
  };

  it("reports no beat detected before any signal", () => {
    render({ bpm: 0, confidence: 0, locked: false, beatPhase: 0 });
    const el = container.querySelector("[role='img']");
    expect(el?.getAttribute("aria-label")).toBe("No beat detected");
    expect(container.querySelector("[style*='animation']")).toBeNull();
  });

  it("spins while searching for a lock", () => {
    render({ bpm: 120, confidence: 0.3, locked: false, beatPhase: 0.2 });
    const el = container.querySelector("[role='img']");
    expect(el?.getAttribute("aria-label")).toBe("Searching for beat");
    const spinner = Array.from(container.querySelectorAll("div")).find((d) =>
      d.getAttribute("style")?.includes("bpm-lock-search"),
    );
    expect(spinner).toBeDefined();
  });

  it("settles into a steady pulse once locked", () => {
    render({ bpm: 120, confidence: 0.9, locked: true, beatPhase: 0.5 });
    const el = container.querySelector("[role='img']");
    expect(el?.getAttribute("aria-label")).toBe("Beat locked");
    const spinner = Array.from(container.querySelectorAll("div")).find((d) =>
      d.getAttribute("style")?.includes("bpm-lock-search"),
    );
    expect(spinner).toBeUndefined();
  });
});

describe("BarTimingHud section marker", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    root.unmount();
    container.remove();
    setLiveTempoFrame(EMPTY_LIVE_TEMPO);
  });

  const marker = (sectionEvent: LiveTempoState["sectionEvent"]) => {
    setLiveTempoFrame({ ...EMPTY_LIVE_TEMPO, sectionEvent });
    flushSync(() => {
      root.render(<BarTimingHud />);
    });
    return container.querySelector("[role='status']")!;
  };

  it("stays hidden, but mounted, until something is detected", () => {
    const el = marker(null);
    expect(el).not.toBeNull();
    expect(el.className).toContain("invisible");
    expect(el.getAttribute("aria-hidden")).toBe("true");
  });

  it("names a drop and a breakdown when one has just been detected", () => {
    const drop = marker({ kind: "drop", atMs: performance.now() });
    expect(drop.textContent).toContain("Drop");
    expect(drop.className).not.toContain("invisible");
    root.unmount();
    root = createRoot(container);
    const breakdown = marker({ kind: "breakdown", atMs: performance.now() });
    expect(breakdown.textContent).toContain("Breakdown");
    expect(breakdown.className).not.toContain("invisible");
  });

  it("clears once the event is a few seconds old", () => {
    const el = marker({ kind: "drop", atMs: performance.now() - 10_000 });
    expect(el.className).toContain("invisible");
  });
});
