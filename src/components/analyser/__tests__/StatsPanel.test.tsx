import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StatsForNerdsPanel } from "../overlays/StatsPanel";
import { EMPTY_STATS } from "../overlays/stats-types";
import { fitPanel, resizePanel, STATS_LAYOUT_KEY } from "../hooks/useStatsPanelLayout";
import { installStorageMock } from "./helpers/test-helpers";

describe("stats panel layout", () => {
  let root: Root;
  let container: HTMLDivElement;
  const render = (fullscreen = false) =>
    flushSync(() =>
      root.render(
        <StatsForNerdsPanel
          stats={EMPTY_STATS}
          fullscreen={fullscreen}
          onClose={() => {}}
          onToggleFullscreen={() => {}}
        />,
      ),
    );
  beforeEach(() => {
    installStorageMock();
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    flushSync(() => root.unmount());
    container.remove();
  });

  it("keeps the whole panel accessible on a small viewport", () => {
    expect(fitPanel({ x: 1800, y: -900, width: 600, height: 900 }, 320, 480)).toEqual({
      x: 12,
      y: 12,
      width: 296,
      height: 456,
    });
  });
  it("resizes from the intended edge without moving the opposite edge", () => {
    const rect = { x: 100, y: 100, width: 400, height: 400 };
    expect(resizePanel(rect, "se", 100, 50, 1000, 800)).toEqual({
      ...rect,
      width: 500,
      height: 450,
    });
    expect(resizePanel(rect, "nw", -50, -50, 1000, 800)).toEqual({
      x: 50,
      y: 50,
      width: 450,
      height: 450,
    });
    expect(resizePanel(rect, "se", 2000, 2000, 1000, 800)).toEqual({
      ...rect,
      width: 888,
      height: 688,
    });
  });
  it("restores position and size and preserves them across full page mode", () => {
    const rect = { x: 40, y: 50, width: 400, height: 450 };
    localStorage.setItem(STATS_LAYOUT_KEY, JSON.stringify(rect));
    render();
    const panel = container.querySelector<HTMLElement>('[role="region"]')!;
    expect(panel.style.left).toBe("40px");
    expect(panel.style.height).toBe("450px");
    render(true);
    expect(container.querySelector('[aria-label="Resize stats panel"]')).toBeNull();
    render();
    expect(panel.style.left).toBe("40px");
    expect(panel.style.width).toBe("400px");
    expect(JSON.parse(localStorage.getItem(STATS_LAYOUT_KEY)!)).toEqual(rect);
  });
  it("supports keyboard resizing and saves the updated layout", () => {
    localStorage.setItem(
      STATS_LAYOUT_KEY,
      JSON.stringify({ x: 40, y: 50, width: 400, height: 450 }),
    );
    render();
    const resize = container.querySelector('[aria-label="Resize stats panel"]')!;
    flushSync(() =>
      resize.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true })),
    );
    expect(JSON.parse(localStorage.getItem(STATS_LAYOUT_KEY)!).width).toBe(410);
    expect(container.textContent).toContain("Text Overlay");
    expect(container.textContent).toContain("Source URL");
  });
  it("renders the asset overlay family readout", () => {
    flushSync(() => {
      root.render(
        <StatsForNerdsPanel
          stats={{
            ...EMPTY_STATS,
            assetOverlayEnabled: true,
            assetOverlayBias: "technical",
            assetOverlayCommonsEnabled: true,
            assetOverlayCommonsTopic: "technical",
            assetOverlayCurrentFamilies: ["grid", "circuit", "scanlines"],
            assetOverlayNextFamilies: ["hud", "angular", "grid"],
            assetOverlayCurrentEntries: [
              {
                label: "Overlay A",
                family: "grid",
                creditLine: "Overlay A — Example Author — CC BY-SA 4.0",
                sourceUrl: "https://commons.wikimedia.org/wiki/File:Overlay_A",
              },
              {
                label: "Overlay B",
                family: "circuit",
                creditLine: "Overlay B — Example Author — CC BY-SA 4.0",
                sourceUrl: "https://commons.wikimedia.org/wiki/File:Overlay_B",
              },
              {
                label: "Overlay C",
                family: "scanlines",
                creditLine: "Overlay C — Example Author — CC BY-SA 4.0",
                sourceUrl: "https://commons.wikimedia.org/wiki/File:Overlay_C",
              },
            ],
            assetOverlayTransition: 0.42,
            textOverlayEnabled: true,
            textOverlaySourceLabel: "Public Domain Library",
            textOverlayCurrentText: "There is no charm equal to tenderness of heart.",
            textOverlayAuthor: "Jane Austen",
            textOverlayWork: "Sense and Sensibility",
            textOverlayRights: "Public Domain",
            textOverlayCreditLine: "Jane Austen, Sense and Sensibility (1811)",
            textOverlaySourceUrl:
              "https://standardebooks.org/ebooks/jane-austen/sense-and-sensibility",
          }}
          fullscreen={false}
          onClose={() => {}}
          onToggleFullscreen={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain("Overlay FX");
    expect(container.textContent).toContain("technical");
    expect(container.textContent).toContain("grid / circuit / scanlines");
    expect(container.textContent).toContain("hud / angular / grid");
    expect(container.textContent).toContain("Public Domain Library");
    expect(container.textContent).toContain("Jane Austen, Sense and Sensibility (1811)");
  });

  it("renders the Wiki-Chroma actor readout when the visual is active", () => {
    flushSync(() => {
      root.render(
        <StatsForNerdsPanel
          stats={{
            ...EMPTY_STATS,
            wikichromaActive: true,
            wikichromaMode: "runner",
            wikichromaSelectedPacks: ["soldier", "fox"],
            wikichromaActiveModels: ["soldier", "fox"],
            wikichromaActorsActive: 5,
            wikichromaBeatLocked: true,
            wikichromaBeatsPerLoop: 2,
            wikichromaLoopCount: 12,
          }}
          fullscreen={false}
          onClose={() => {}}
          onToggleFullscreen={() => {}}
        />,
      );
    });

    expect(container.textContent).toContain("Wiki-Chroma");
    expect(container.textContent).toContain("runner");
    expect(container.textContent).toContain("soldier / fox");
    expect(container.textContent).toContain("locked");
  });

  it("hides the Wiki-Chroma section when the visual is inactive", () => {
    flushSync(() => {
      root.render(
        <StatsForNerdsPanel
          stats={EMPTY_STATS}
          fullscreen={false}
          onClose={() => {}}
          onToggleFullscreen={() => {}}
        />,
      );
    });

    expect(container.textContent).not.toContain("Wiki-Chroma");
  });
});
