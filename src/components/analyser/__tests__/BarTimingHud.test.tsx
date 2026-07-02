import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { BpmLockIndicator } from "../BarTimingHud";

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
