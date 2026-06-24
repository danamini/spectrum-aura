import { describe, expect, it } from "vitest";

import { DEFAULT_VISUAL_ID, getVisualDefinition, VISUALS } from "../visuals";

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
});
