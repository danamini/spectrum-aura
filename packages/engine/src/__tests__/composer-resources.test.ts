import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { DEFAULT_SETTINGS } from "../settings";
import { Composer } from "../composer";

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  vi.spyOn(THREE.TextureLoader.prototype, "load").mockImplementation(() => new THREE.Texture());
});
afterEach(() => vi.restoreAllMocks());

function setup(pixelRatio = 1) {
  const renderer = {
    getPixelRatio: () => pixelRatio,
    getSize: (size: THREE.Vector2) => size.set(640, 480),
    getRenderTarget: () => null,
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
  } as unknown as THREE.WebGLRenderer;
  return new Composer(renderer, new THREE.Scene(), new THREE.PerspectiveCamera(), 640, 480);
}

describe("Composer resources", () => {
  it("disposes every pass, including disabled effects, and composer targets", () => {
    const fx = setup();
    const passes = fx.composer.passes.map((pass) => vi.spyOn(pass, "dispose"));
    const targets = [fx.composer.renderTarget1, fx.composer.renderTarget2].map((target) =>
      vi.spyOn(target, "dispose"),
    );
    const font = vi.spyOn(fx.retroFx.uniforms.tFont.value as THREE.Texture, "dispose");
    const overlays = ["tOverlayA", "tOverlayB", "tOverlayC"].map((key) =>
      vi.spyOn(fx.assetOverlay.uniforms[key].value as THREE.Texture, "dispose"),
    );
    expect(fx.ssao.enabled).toBe(false);
    fx.dispose();
    for (const dispose of [...passes, ...targets, ...overlays, font]) {
      expect(dispose).toHaveBeenCalledOnce();
    }
  });

  it("releases SSAO shader and noise resources omitted by Three.js pass disposal", () => {
    const fx = setup();
    const material = vi.spyOn(fx.ssao.ssaoMaterial, "dispose");
    const noise = vi.spyOn(fx.ssao.noiseTexture, "dispose");
    fx.dispose();
    expect(material).toHaveBeenCalledOnce();
    expect(noise).toHaveBeenCalledOnce();
  });

  it("follows renderer pixel-ratio changes without resizing passes twice", () => {
    const fx = setup(2);
    const resizes = fx.composer.passes.map((pass) => vi.spyOn(pass, "setSize"));
    vi.spyOn(fx.renderer, "getPixelRatio").mockReturnValue(0.85);
    fx.resize(640, 480);
    expect(fx.composer.renderTarget1.width).toBe(544);
    for (const resize of resizes) {
      expect(resize).toHaveBeenCalledExactlyOnceWith(544, 408);
    }
    fx.dispose();
  });

  it.each([1, 2])("resizes passes once at pixel ratio %i", (pixelRatio) => {
    const fx = setup(pixelRatio);
    const resizes = fx.composer.passes.map((pass) => vi.spyOn(pass, "setSize"));
    fx.resize(800, 600);
    for (const resize of resizes) {
      expect(resize).toHaveBeenCalledExactlyOnceWith(800 * pixelRatio, 600 * pixelRatio);
    }
    expect(fx.ssao.ssaoRenderTarget.width).toBe(800 * pixelRatio);
    expect(fx.ssao.ssaoRenderTarget.height).toBe(600 * pixelRatio);
    expect(fx.renderer.clear).toHaveBeenCalledTimes(2);
    fx.dispose();
  });
});

it.each([30, 60, 120])("uses elapsed time for FX at %i Hz", (hz) => {
  const fx = setup();
  const reactive = {
    bass: 0.4,
    mid: 0.2,
    high: 0.1,
    centroid: 0.3,
    bpm: 120,
    bpmConfidence: 0.8,
    pulse: 0,
    beat: false,
    performance: false,
    qualityTier: 0 as const,
  };
  const settings = { ...DEFAULT_SETTINGS, glitch: true, glitchIntensity: 0.5 };
  for (let i = 0; i < hz * 0.8; i++) fx.apply(settings, reactive, 1 / hz);
  expect(fx.crtFx.uniforms.time.value).toBeCloseTo(0.8, 8);
  expect(fx.assetOverlay.uniforms.time.value).toBeCloseTo(
    0.8 * 0.96 * settings.assetOverlaySpeed * (0.7 + 0.3 * 1.2),
    8,
  );
  expect(fx.glitch.enabled).toBe(false);
  fx.apply(settings, reactive, 0);
  expect(fx.crtFx.uniforms.time.value).toBeCloseTo(0.8, 8);
  fx.apply(settings, reactive, 60);
  expect(fx.crtFx.uniforms.time.value).toBeCloseTo(0.9, 8);
  fx.dispose();
});
