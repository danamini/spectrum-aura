import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const CONTROL_PANEL = "src/components/analyser/ControlPanel.tsx";
const VIEW_SETTINGS = "src/components/analyser/control-panel/ViewSettings.tsx";
const PRIMITIVES = "src/components/analyser/control-panel/primitives.tsx";

function extractSetKeys(source: string): string[] {
  return [...source.matchAll(/set\(\{\s*([A-Za-z0-9]+):/g)].map((m) => m[1]);
}

function extractSliderLabels(source: string): string[] {
  const labels: string[] = [];
  for (const block of source.matchAll(/<S\b[^>]*label="([^"]*)"[^/]*\/>/gs)) {
    labels.push(block[1]);
  }
  return labels;
}

describe("ControlPanel decomposition regression", () => {
  it("delegates per-view settings to ViewSettings", () => {
    const panel = readFileSync(join(process.cwd(), CONTROL_PANEL), "utf8");
    expect(panel).toMatch(/<ViewSettings\s+s=\{s\}\s+set=\{set\}\s*\/>/);
    expect(panel).not.toMatch(/s\.view === "combo"/);
  });

  it("imports shared panel primitives", () => {
    const panel = readFileSync(join(process.cwd(), CONTROL_PANEL), "utf8");
    expect(panel).toMatch(/from "\.\/control-panel\/primitives"/);
    expect(panel).toMatch(/from "\.\/TempoReadout"/);
    expect(panel).not.toMatch(/function Sw\(/);
  });

  it("preserves all per-view set() keys in ViewSettings", () => {
    const viewSettings = readFileSync(join(process.cwd(), VIEW_SETTINGS), "utf8");
    const keys = new Set(extractSetKeys(viewSettings));

    const expectedPerViewKeys = [
      "orbitSpeed",
      "comboSphereSize",
      "classicPeakStyle",
      "rippleRingCount",
      "datastreamAmplitude",
      "nebulaAmplitude",
      "monolithAmplitude",
      "mandalaAmplitude",
      "terrainAmplitude",
      "obsidianShardDetail",
      "torusColorMode",
      "soundwallAmplitude",
      "geometrynebulaAmplitude",
      "reztubeAmplitude",
      "assetflowAmplitude",
      "wikichromaAmplitude",
      "wikichromaFlowStrength",
      "wikichromaBeatsPerLoop",
      "wikichromaActorPacks",
      "stagelightsAmplitude",
      "stagelightsFixtureCount",
      "stagelightsLasers",
    ];

    for (const key of expectedPerViewKeys) {
      expect(keys.has(key), `missing ViewSettings key: ${key}`).toBe(true);
    }
  });

  it("keeps classic peak swatches on theme tokens", () => {
    const viewSettings = readFileSync(join(process.cwd(), VIEW_SETTINGS), "utf8");
    expect(viewSettings).toMatch(/CLASSIC_PEAK_SWATCHES/);
    expect(viewSettings).not.toMatch(/#ff2d95/);
  });

  it("exports Sw/Bn/Row/ToggleRow/S/Disclosure from primitives", () => {
    const primitives = readFileSync(join(process.cwd(), PRIMITIVES), "utf8");
    for (const name of [
      "export function Sw",
      "export function Bn",
      "export function Row",
      "export function ToggleRow",
      "export function S",
      "export function Disclosure",
    ]) {
      expect(primitives).toContain(name);
    }
  });

  it("groups every post-FX toggle into themed FxSections without dropping rows", () => {
    // The flat FX list stopped scaling, so the tab is organized into
    // collapsible FxSection groups with active-effect counts. Every effect
    // row must still exist, and every row carries a randomize lock pin.
    const panel = readFileSync(join(process.cwd(), CONTROL_PANEL), "utf8");
    expect(panel.match(/<FxSection/g)?.length).toBe(6);
    for (const label of [
      "Bloom",
      "Color grading",
      "Kaleidoscope",
      "Mirror",
      "CRT",
      "Projector film",
      "Retro system",
      "ASCII",
      "Demo-scene text overlay",
      "Asset overlay",
    ]) {
      expect(panel).toContain(`label="${label}"`);
    }
    for (const lock of ["bloom", "grading", "retro", "ascii", "glitch", "assetOverlay"]) {
      expect(panel).toContain(`lockId="${lock}"`);
    }
    // Every section surfaces its pinned count alongside the active count.
    expect(panel.match(/pinned=\{pinnedIn\(/g)?.length).toBe(6);
  });

  it("keeps the pipeline-order editor wired to the engine order", () => {
    const panel = readFileSync(join(process.cwd(), CONTROL_PANEL), "utf8");
    expect(panel).toContain('label="Pipeline order"');
    expect(panel).toContain("s.fxPipelineOrder.map(");
    expect(panel).toContain("DEFAULT_FX_PIPELINE_ORDER");
  });

  it("covers every visual mode in ViewSettings sliders or toggles", () => {
    const viewSettings = readFileSync(join(process.cwd(), VIEW_SETTINGS), "utf8");
    const views = [
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
    ];
    for (const view of views) {
      expect(viewSettings, `missing view block: ${view}`).toMatch(
        new RegExp(`s\\.view === "${view}"`),
      );
    }
    expect(extractSliderLabels(viewSettings).length).toBeGreaterThan(50);
  });
});
