import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StatsForNerdsPanel } from "../overlays/StatsPanel";
import { EMPTY_STATS } from "../overlays/stats-types";

describe("StatsForNerdsPanel", () => {
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
