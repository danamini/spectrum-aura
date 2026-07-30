import * as THREE from "three";
import type { Settings } from "./settings";

/**
 * Transparent DOM-overlay renderer for the engine's texture effects —
 * scanlines, vignette, film grain, flicker — driven by the same `Settings`
 * fields the Composer uses (`crtScanlineIntensity`, `vignetteAmount`,
 * `grainAmount`, `projectorFilmFlicker`).
 *
 * For content the Composer can process (anything in a Three.js scene), use
 * the Composer: it is the real pipeline. This overlay exists for pixels a
 * frontend cannot legally touch — cross-origin iframes like YouTube embeds —
 * where the only option is compositing an effect layer on top. Rendering it
 * from engine settings keeps every frontend's "VHS look" in one place.
 */

const OVERLAY_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const OVERLAY_FRAGMENT = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uScanline;
  uniform float uVignette;
  uniform float uGrain;
  uniform float uFlicker;
  uniform float uPulse;
  uniform float uTime;
  uniform vec2 uResolution;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    // CRT scanlines: darken alternating device rows.
    float scan = sin(vUv.y * uResolution.y * 3.14159) * 0.5 + 0.5;
    float dark = uScanline * 0.38 * (1.0 - scan);

    // Vignette: radial falloff toward the corners, breathing on the beat.
    vec2 centered = vUv - 0.5;
    dark += uVignette * (1.0 + 0.15 * uPulse) * smoothstep(0.3, 0.85, length(centered));

    // Tape grain: per-pixel noise, dark specks add alpha, bright specks add color.
    float noise = (hash(vUv * uResolution + fract(uTime) * 61.7) - 0.5) * uGrain;
    float sparkle = max(noise, 0.0) * 0.5;
    dark += max(-noise, 0.0) * 0.45;

    // Projector flicker: full-frame brightness wobble.
    dark += uFlicker * 0.05 * (0.5 + 0.5 * sin(uTime * 87.0));

    gl_FragColor = vec4(vec3(sparkle), clamp(dark, 0.0, 0.85));
  }
`;

export class OverlayFx {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private material: THREE.ShaderMaterial;

  constructor(canvas: HTMLCanvasElement, width: number, height: number) {
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, premultipliedAlpha: false });
    this.renderer.setClearColor(0x000000, 0);
    this.material = new THREE.ShaderMaterial({
      vertexShader: OVERLAY_VERTEX,
      fragmentShader: OVERLAY_FRAGMENT,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uScanline: { value: 0 },
        uVignette: { value: 0 },
        uGrain: { value: 0 },
        uFlicker: { value: 0 },
        uPulse: { value: 0 },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
      },
    });
    this.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material));
    this.resize(width, height);
  }

  resize(width: number, height: number) {
    this.renderer.setSize(width, height, false);
    (this.material.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  /** Draw one overlay frame from the look's settings and the beat pulse (0–1). */
  render(s: Settings, pulse: number, timeSec: number) {
    const u = this.material.uniforms;
    u.uScanline.value = s.crtFx ? s.crtScanlineIntensity : 0;
    u.uVignette.value =
      (s.vignette ? s.vignetteAmount * 0.3 : 0) + (s.crtFx ? s.crtVignette * 0.35 : 0);
    u.uGrain.value = s.grain ? s.grainAmount : 0;
    u.uFlicker.value = s.projectorFilmFx ? s.projectorFilmFlicker : 0;
    u.uPulse.value = pulse;
    u.uTime.value = timeSec;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.material.dispose();
    this.renderer.dispose();
  }
}

/**
 * CSS filter string derived from a look's grading settings, for DOM elements
 * (like a cross-origin iframe) that can't run through the Composer's grading
 * pass. `hue` matches the composer's radians-based setting.
 */
export function gradingToCssFilter(s: Settings, bands: { bass: number; beat: number }): string {
  if (!s.grading) return "none";
  const saturate = (s.saturation * (1 + 0.35 * bands.bass)).toFixed(3);
  const contrast = s.contrast.toFixed(3);
  const brightness = (s.exposure * (1 + 0.12 * bands.beat)).toFixed(3);
  const hueDeg = ((s.hue * 180) / Math.PI).toFixed(1);
  return `saturate(${saturate}) contrast(${contrast}) brightness(${brightness}) hue-rotate(${hueDeg}deg)`;
}
