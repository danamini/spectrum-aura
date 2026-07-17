import { describe, expect, it } from "vitest";

import {
  DEFAULT_VISUAL_ID,
  getVisualDefinition,
  pickNextView,
  VISUALS,
  type VisualDefinition,
} from "../visuals";

describe("visual registry", () => {
  it("keeps runtime visual order and metadata in one place", () => {
    expect(VISUALS.map((visual) => visual.id)).toEqual([
      "combo",
      "classic",
      "ripple",
      "datastream",
      "nebula",
      "monolith",
      "mandala",
      "terrain",
      "obsidian",
      "torus",
      "soundwall",
      "geometrynebula",
      "reztube",
      "assetflow",
      "wikichroma",
      "stagelights",
    ]);
    expect(DEFAULT_VISUAL_ID).toBe("combo");
    expect(getVisualDefinition("terrain")).toMatchObject({
      label: "Terrain",
      fullscreenKey: "terrainFullscreen",
      wireframeKey: "terrainWireframe",
      sceneGroupKey: "terrainGroup",
    });
    expect(getVisualDefinition("reztube")).toMatchObject({
      label: "On-rails Tube",
      settingsLabel: "On-rails Tube settings",
    });
    expect(getVisualDefinition("missing-visual")).toBeUndefined();
  });

  it("tags every built-in visual with an energy tier", () => {
    for (const visual of VISUALS) {
      expect(["calm", "mid", "high"]).toContain(visual.energy);
    }
  });
});

describe("pickNextView", () => {
  const visuals: VisualDefinition[] = [
    { id: "a", label: "A", settingsLabel: "A", order: 0, energy: "calm" },
    { id: "b", label: "B", settingsLabel: "B", order: 1, energy: "calm" },
    { id: "c", label: "C", settingsLabel: "C", order: 2, energy: "high" },
    { id: "d", label: "D", settingsLabel: "D", order: 3, energy: "mid" },
  ];

  it("prefers a different energy tier than the current view", () => {
    for (let i = 0; i < 30; i++) {
      const next = pickNextView("a", visuals, () => i / 30);
      expect(visuals.find((v) => v.id === next)?.energy).not.toBe("calm");
    }
  });

  it("never returns the current view", () => {
    for (let i = 0; i < 30; i++) {
      expect(pickNextView("c", visuals, () => i / 30)).not.toBe("c");
    }
  });

  it("falls back to any other view when every option shares the current tier", () => {
    const sameTier: VisualDefinition[] = [
      { id: "x", label: "X", settingsLabel: "X", order: 0, energy: "mid" },
      { id: "y", label: "Y", settingsLabel: "Y", order: 1, energy: "mid" },
    ];
    expect(pickNextView("x", sameTier, () => 0)).toBe("y");
  });

  it("returns the same id when there is only one visual", () => {
    expect(pickNextView("a", [visuals[0]!])).toBe("a");
  });
});
