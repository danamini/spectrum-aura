import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { AmbientSource } from "../ambient-source";
import { createSceneUpdateOpts, syncSceneUpdateOpts } from "../scene-update-opts";
import { Scene } from "../scene";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import { GlyphField, MAX_GLYPHS, layoutGlyphs, wrapText } from "../text-glyphs";
import { TEXT_SOURCE_IDS, TEXT_STYLES } from "../text-sources/registry";

beforeEach(() => {
  const context = new Proxy(
    {
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      measureText: () => ({ width: 100 }),
    },
    { get: (target, key) => Reflect.get(target, key) ?? vi.fn() },
  );
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
  vi.spyOn(GLTFLoader.prototype, "load").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("offline"))),
  );
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("wrapText", () => {
  it("wraps on word boundaries without exceeding the limit", () => {
    const lines = wrapText("the quick brown fox jumps over the lazy dog", 12);
    expect(lines).toEqual(["the quick", "brown fox", "jumps over", "the lazy dog"]);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(12);
  });

  it("splits a word longer than the line and loses no characters", () => {
    const lines = wrapText("a supercalifragilistic b", 8);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThanOrEqual(8);
    expect(lines.join("").replace(/ /g, "")).toBe("asupercalifragilisticb");
    expect(wrapText("   ", 10)).toEqual([]);
  });
});

describe("layoutGlyphs", () => {
  it("places only visible characters, centred on the origin", () => {
    const layout = layoutGlyphs("AB CD", 10);
    expect(layout.chars).toEqual(["A", "B", "C", "D"]);
    expect(layout.x[0]! + layout.x[3]!).toBeCloseTo(0, 5);
    // The space still advances the pen: the B–C gap is twice the A–B gap.
    expect(layout.x[2]! - layout.x[1]!).toBeCloseTo((layout.x[1]! - layout.x[0]!) * 2, 5);
  });

  it("shrinks long lines to fit the width and stacks wrapped lines downward", () => {
    const wide = layoutGlyphs("X".repeat(26), 4);
    expect(wide.x[wide.count - 1]! - wide.x[0]!).toBeLessThanOrEqual(4);
    const stacked = layoutGlyphs("alpha beta gamma delta epsilon zeta", 8, 12);
    expect(new Set([...stacked.y].map((y) => y.toFixed(3))).size).toBeGreaterThan(1);
    expect(stacked.y[0]!).toBeGreaterThan(stacked.y[stacked.count - 1]!);
  });

  it("never exceeds the glyph budget", () => {
    expect(layoutGlyphs("word ".repeat(400), 8).count).toBeLessThanOrEqual(MAX_GLYPHS);
    expect(layoutGlyphs("", 8).count).toBe(0);
  });
});

describe("GlyphField", () => {
  const frame = (time: number, dt = 1 / 60) => ({
    dt,
    time,
    audio: new AmbientSource().read(time * 1000),
    intensity: 1,
    scale: 1,
    colorAt: (t: number, out: THREE.Color) => out.setRGB(t, 0.5, 1 - t),
  });
  const perCharacter = TEXT_STYLES.filter((style) => style.perCharacter).map((style) => style.id);

  it.each(perCharacter)("%s places a bounded number of finite glyphs", (style) => {
    const field = new GlyphField();
    for (let i = 0; i < 180; i++) field.update(style, "MAKE SOME NOISE TONIGHT", frame(i / 60));
    expect(field.mesh.visible).toBe(true);
    expect(field.mesh.count).toBeGreaterThan(0);
    expect(field.mesh.count).toBeLessThanOrEqual(MAX_GLYPHS);
    const matrices = field.mesh.instanceMatrix.array.slice(0, field.mesh.count * 16);
    expect(matrices.every(Number.isFinite)).toBe(true);
    const alpha = field.mesh.geometry.attributes.aAlpha!.array.slice(0, field.mesh.count);
    expect([...alpha].every((a) => a >= 0 && a <= 1)).toBe(true);
    field.dispose();
  });

  it("types the phrase out over time rather than showing it at once", () => {
    const field = new GlyphField();
    field.update("typewriter", "HELLO WORLD", frame(0, 0.02));
    const early = field.mesh.count;
    for (let i = 1; i < 240; i++) field.update("typewriter", "HELLO WORLD", frame(i / 60));
    // Ten letters plus the cursor.
    expect(early).toBeLessThan(4);
    expect(field.mesh.count).toBe(11);
    field.dispose();
  });

  it("survives empty text, an oversized phrase and unusual characters", () => {
    const field = new GlyphField();
    for (const text of ["", "x".repeat(2000), "naïve — “quoted” 日本語 🎵"]) {
      for (const style of perCharacter) {
        field.update(style, text, frame(1));
        expect(field.mesh.count).toBeLessThanOrEqual(MAX_GLYPHS);
      }
    }
    field.hide();
    expect(field.mesh.visible).toBe(false);
    field.dispose();
  });
});

describe("text overlay in the scene", () => {
  function run(scene: Scene, over: Partial<Settings>, frames = 4) {
    const opts = createSceneUpdateOpts("combo");
    const settings = { ...DEFAULT_SETTINGS, textOverlayEnabled: true, ...over, view: "combo" };
    for (let i = 0; i < frames; i++) {
      syncSceneUpdateOpts(opts, settings, "combo", false, false);
      scene.update(1 / 60, i / 60, new AmbientSource().read(i * 16), opts);
    }
  }

  it("shows a phrase from every registered source, offline", () => {
    const scene = new Scene(640, 480);
    for (const source of TEXT_SOURCE_IDS) {
      run(scene, { textOverlaySource: source });
      const state = scene.getTextOverlayDebugState();
      expect(state.sourceId, source).toBe(source);
      expect(state.currentText.length, source).toBeGreaterThan(0);
      expect(state.sourceLabel.length, source).toBeGreaterThan(0);
    }
    scene.dispose();
  });

  it("shows typed text straight away and follows edits", () => {
    const scene = new Scene(640, 480);
    run(scene, { textOverlaySource: "custom", textOverlayCustomText: "FIRST LINE" });
    expect(scene.getTextOverlayDebugState().currentText).toBe("FIRST LINE");
    run(scene, { textOverlaySource: "custom", textOverlayCustomText: "EDITED" });
    expect(scene.getTextOverlayDebugState().currentText).toBe("EDITED");
    run(scene, { textOverlaySource: "custom", textOverlayCustomText: "   " });
    expect(scene.getTextOverlayDebugState().currentText.length).toBeGreaterThan(0);
    scene.dispose();
  });

  it("makes no network request for the offline sources", () => {
    const fetchSpy = vi.fn(() => Promise.reject(new Error("offline")));
    vi.stubGlobal("fetch", fetchSpy);
    const scene = new Scene(640, 480);
    for (const source of ["custom", "telemetry", "greets", "public-domain"] as const) {
      run(scene, { textOverlaySource: source }, 400);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
    scene.dispose();
  });

  it("switches between phrase planes and per-character glyphs without leaving both on", () => {
    const scene = new Scene(640, 480);
    const glyphs = () => {
      let mesh: THREE.InstancedMesh | undefined;
      scene.textOverlayGroup.traverse((o) => {
        if (o instanceof THREE.InstancedMesh) mesh = o;
      });
      return mesh!;
    };
    const planes = () =>
      scene.textOverlayGroup.children.filter(
        (o) => o instanceof THREE.Mesh && !(o instanceof THREE.InstancedMesh) && o.visible,
      ).length;
    run(scene, { textOverlayStyle: "wave", textOverlaySource: "greets" });
    expect(glyphs().visible).toBe(true);
    expect(planes()).toBe(0);
    run(scene, { textOverlayStyle: "bounce", textOverlaySource: "greets" });
    expect(glyphs().visible).toBe(false);
    expect(planes()).toBe(1);
    scene.dispose();
  });
});
