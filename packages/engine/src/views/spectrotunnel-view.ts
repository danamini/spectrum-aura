import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { FULLSCREEN_VERTEX, displayLevel, logBin, type LazyView, type ViewFrame } from "./types";

const FREQS = 128;
const ROWS = 256;
const ROWS_PER_SECOND = 72;
const FIRE = [new THREE.Color("#ff3d00"), new THREE.Color("#ffd000"), new THREE.Color("#7df9ff")];

/**
 * The demoscene tunnel, textured with the music itself: the walls are a
 * live spectrogram, newest slice at the mouth and older audio receding into
 * the distance, so a drum fill is visible travelling down the tube.
 *
 * Rendered as one clip-space quad — the whole view is a fragment shader plus
 * a 32 KB history texture that takes one row write per audio slice.
 */
export class SpectroTunnelView implements LazyView {
  readonly group = new THREE.Group();
  private readonly history = new Uint8Array(FREQS * ROWS);
  private readonly texture: THREE.DataTexture;
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private head = 0;
  private rowDebt = 0;
  private travel = 0;
  private twist = 0;
  private flash = 0;

  constructor() {
    this.texture = new THREE.DataTexture(this.history, FREQS, ROWS, THREE.RedFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.MirroredRepeatWrapping;
    this.texture.wrapT = THREE.RepeatWrapping;
    this.texture.needsUpdate = true;

    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tSpectrum: { value: this.texture },
          uHead: { value: 0 },
          uAspect: { value: 1 },
          uTravel: { value: 0 },
          uTwist: { value: 0 },
          uAmp: { value: 1 },
          uFlash: { value: 0 },
          uBass: { value: 0 },
          uCenter: { value: new THREE.Vector2() },
          uColorA: { value: new THREE.Color() },
          uColorB: { value: new THREE.Color() },
          uColorC: { value: new THREE.Color() },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D tSpectrum;
          uniform float uHead;
          uniform float uAspect;
          uniform float uTravel;
          uniform float uTwist;
          uniform float uAmp;
          uniform float uFlash;
          uniform float uBass;
          uniform vec2 uCenter;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          varying vec2 vUv;
          const float TAU = 6.28318530718;
          vec3 ramp(float t) {
            vec3 c = mix(uColorB * 0.25, uColorA, smoothstep(0.0, 0.5, t));
            c = mix(c, uColorC, smoothstep(0.45, 0.85, t));
            return mix(c, vec3(1.0), smoothstep(0.85, 1.0, t));
          }
          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            p.x *= uAspect;
            p -= uCenter;
            float r = length(p) + 1e-4;
            float depth = 0.55 / r;              // distance down the tube
            float a = atan(p.y, p.x) / TAU + depth * uTwist;
            // Six mirrored spectra around the wall; mirroring hides the seam.
            float freq = abs(fract(a * 3.0) * 2.0 - 1.0);
            // depth 0 at the mouth = newest slice (the row just before uHead).
            float age = depth * 0.085;
            float row = uHead - (0.5 + age * ${ROWS.toFixed(1)}) / ${ROWS.toFixed(1)};
            float level = texture2D(tSpectrum, vec2(freq, row)).r;
            level *= uAmp;
            // Brightness follows level squared: quiet walls stay dark so the
            // loud slices read as structure instead of an even wash.
            vec3 col = ramp(clamp(level, 0.0, 1.0)) * (0.05 + level * level * 0.85);
            // Structural rings and ribs that slide past with the travel.
            float rings = smoothstep(0.92, 1.0, abs(fract(depth * 1.6 - uTravel) * 2.0 - 1.0));
            float ribs = smoothstep(0.94, 1.0, abs(fract(a * 12.0) * 2.0 - 1.0));
            col += uColorC * (rings * 0.22 + ribs * 0.08) * (0.4 + uBass);
            // Fog toward the vanishing point, which glows on the beat.
            float fog = exp(-depth * 0.11);
            col *= fog;
            col += mix(uColorA, vec3(1.0), 0.4) * exp(-r * 11.0) * (0.2 + uFlash * 0.9 + uBass * 0.35);
            col *= smoothstep(1.9, 0.5, r / max(1.0, uAspect));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -10;
    this.group.add(this.quad);
  }

  private writeRow(audio: ViewFrame["audio"]) {
    const bins = audio.bins;
    const offset = this.head * FREQS;
    for (let i = 0; i < FREQS; i++) {
      const byte = bins.length > 0 ? bins[logBin(i, FREQS, bins.length)]! : 0;
      this.history[offset + i] = Math.round(displayLevel(byte) * 255);
    }
    this.head = (this.head + 1) % ROWS;
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const u = this.quad.material.uniforms;
    const bass = normalizedBand(audio.bass);

    // Fixed slice rate, independent of display refresh.
    this.rowDebt = Math.min(
      8,
      this.rowDebt + dt * ROWS_PER_SECOND * Math.max(0.1, opts.spectrotunnelSpeed),
    );
    let wrote = false;
    while (this.rowDebt >= 1) {
      this.rowDebt -= 1;
      this.writeRow(audio);
      wrote = true;
    }
    if (wrote) this.texture.needsUpdate = true;

    if (audio.beat) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    this.travel += dt * opts.spectrotunnelSpeed * (0.7 + bass * 0.9);
    this.twist +=
      (opts.spectrotunnelTwist * (0.6 + audio.mid * 0.8) - this.twist) * Math.min(1, dt * 3);

    const palette = opts.spectrotunnelUsePalette ? f.palette : FIRE;
    u.uColorA!.value.copy(palette[0]);
    u.uColorB!.value.copy(palette[1]);
    u.uColorC!.value.copy(palette[2]);
    // The fractional row keeps the scroll smooth between slice writes.
    u.uHead!.value = (this.head + this.rowDebt) / ROWS;
    u.uAspect!.value = camera.aspect || 1;
    u.uTravel!.value = this.travel;
    u.uTwist!.value = this.twist * 0.06;
    u.uAmp!.value = Math.max(0.05, opts.spectrotunnelAmplitude);
    u.uFlash!.value = this.flash;
    u.uBass!.value = bass;
    const sway = 0.12 + f.drift * 0.25;
    (u.uCenter!.value as THREE.Vector2).set(
      Math.sin(time * 0.31) * sway + (opts.cameraMouse ? Math.sin(f.mouseYaw) * 0.5 : 0),
      Math.cos(time * 0.23) * sway * 0.8 +
        (opts.cameraMouse ? f.mousePitch * 0.3 : 0) +
        f.kick * 0.04,
    );
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.quad.material.dispose();
    this.texture.dispose();
  }
}
