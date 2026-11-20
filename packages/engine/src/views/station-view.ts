import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { logBin, meterLevel, type LazyView, type ViewFrame } from "./types";

const BANDS = 64;
const HALF_W = 5;
const HALF_H = 3;
const LENGTH = 240;
/** Cold industrial triad used when "Use palette" is off. */
const REACTOR = [
  new THREE.Color("#ff7a1a"),
  new THREE.Color("#0d2a4a"),
  new THREE.Color("#3df2ff"),
];

/**
 * A flight down the spine of a space station. Each wall bay is a level meter
 * for one band of the spectrum, the ceiling strips throw a chaser of light
 * down the corridor on every beat, the floor mirrors the lot, and the far
 * bulkhead glows with the bass.
 *
 * The corridor is one inside-out box; ribs, bays, lights and reflections are
 * all drawn in the fragment shader from the surface position, so the detail
 * costs no geometry.
 */
export class StationView implements LazyView {
  readonly group = new THREE.Group();
  private readonly spectrum = new Uint8Array(BANDS);
  private readonly spectrumTex: THREE.DataTexture;
  private readonly hull: THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial>;
  private scroll = 0;
  private chase = 0;
  private flash = 0;
  private lastPhase = 0;
  private roll = 0;

  constructor() {
    this.spectrumTex = new THREE.DataTexture(this.spectrum, BANDS, 1, THREE.RedFormat);
    this.spectrumTex.magFilter = THREE.LinearFilter;
    this.spectrumTex.minFilter = THREE.LinearFilter;
    this.spectrumTex.wrapS = THREE.MirroredRepeatWrapping;
    this.spectrumTex.needsUpdate = true;

    const geo = new THREE.BoxGeometry(HALF_W * 2, HALF_H * 2, LENGTH);
    geo.translate(0, 0, -LENGTH / 2 + 10);
    this.hull = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          tSpectrum: { value: this.spectrumTex },
          uScroll: { value: 0 },
          uChase: { value: 0 },
          uChaseOn: { value: 1 },
          uAmp: { value: 1 },
          uFlash: { value: 0 },
          uBass: { value: 0 },
          uTime: { value: 0 },
          uColorA: { value: new THREE.Color() },
          uColorB: { value: new THREE.Color() },
          uColorC: { value: new THREE.Color() },
        },
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          varying vec3 vNormalL;
          void main() {
            vPos = position;
            vNormalL = normal;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform sampler2D tSpectrum;
          uniform float uScroll;
          uniform float uChase;
          uniform float uChaseOn;
          uniform float uAmp;
          uniform float uFlash;
          uniform float uBass;
          uniform float uTime;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          varying vec3 vPos;
          varying vec3 vNormalL;
          const float BAY = 4.0;
          float hash(float n) { return fract(sin(n * 127.1) * 43758.5453); }

          // A side wall: structural ribs between bays, each bay a segmented level meter.
          vec3 wall(float y, float z, float side) {
            float bayId = floor(z / BAY);
            float bz = fract(z / BAY);
            float h = (y + ${HALF_H.toFixed(1)}) / ${(HALF_H * 2).toFixed(1)};
            vec3 col = uColorB * 0.11 + vec3(0.006);
            float rib = smoothstep(0.1, 0.07, bz) + smoothstep(0.9, 0.93, bz);
            col = mix(col, uColorB * 0.015, rib);
            // Rib edge lights.
            col += uColorC * (smoothstep(0.012, 0.0, abs(bz - 0.1)) + smoothstep(0.012, 0.0, abs(bz - 0.9))) * 0.35;
            float band = fract((bayId * 7.0 + side * 3.0) / ${BANDS.toFixed(1)} * 2.0);
            float level = clamp(texture2D(tSpectrum, vec2(band, 0.5)).r * uAmp, 0.0, 1.0);
            float inBay = step(0.2, bz) * step(bz, 0.8) * step(0.12, h) * step(h, 0.88);
            float m = (h - 0.12) / 0.76;
            float seg = step(0.22, fract(m * 14.0));
            float lit = step(m, level);
            vec3 meter = mix(uColorC, uColorA, smoothstep(0.55, 1.0, m));
            col += meter * inBay * seg * (lit * 0.95 + 0.09);
            // Peak segment burns brightest.
            col += meter * inBay * seg * exp(-abs(m - level) * 22.0) * lit * 0.9;
            return col;
          }

          vec3 ceilingLight(float x, float z) {
            vec3 col = uColorB * 0.03;
            float strips = smoothstep(0.34, 0.26, abs(abs(x) - 2.2));
            // Chaser: a pulse of light running away down the corridor.
            float travel = fract(z / 60.0 - uChase);
            float pulse = exp(-travel * 7.0) * uChaseOn;
            col += mix(uColorC, vec3(1.0), 0.35) * strips * (0.22 + pulse * 1.5 + uFlash * 0.4);
            // Cross-braces.
            col += uColorA * smoothstep(0.03, 0.0, abs(fract(z / 8.0) - 0.5)) * 0.14;
            return col;
          }

          void main() {
            float z = -vPos.z + uScroll;
            float depth = clamp((10.0 - vPos.z) / ${LENGTH.toFixed(1)}, 0.0, 1.0);
            vec3 col;
            if (abs(vNormalL.x) > 0.5) {
              col = wall(vPos.y, z, sign(vPos.x));
            } else if (vNormalL.y < -0.5) {
              col = ceilingLight(vPos.x, z);
            } else if (vNormalL.y > 0.5) {
              // Deck: grating, guide lines, and a blurred mirror of walls and ceiling.
              float grate = step(0.1, fract(vPos.x * 1.5)) * step(0.1, fract(z * 1.5));
              col = uColorB * 0.035 * (0.6 + 0.4 * grate);
              float guide = smoothstep(0.07, 0.03, abs(abs(vPos.x) - 3.6));
              col += uColorA * guide * (0.4 + uBass * 0.5);
              float nearWall = smoothstep(0.0, ${HALF_W.toFixed(1)}, abs(vPos.x));
              col += wall(-${HALF_H.toFixed(1)} + (1.0 - nearWall) * 4.0 + 0.6, z, sign(vPos.x)) * nearWall * nearWall * 0.35;
              col += ceilingLight(vPos.x, z) * 0.22;
            } else {
              // The far bulkhead: a reactor door breathing with the bass.
              float r = length(vPos.xy * vec2(0.8, 1.0));
              float ring = smoothstep(0.12, 0.0, abs(r - 2.0 - uBass * 0.25));
              col = mix(uColorA, vec3(1.0), 0.3) * (exp(-r * 0.9) * (0.5 + uBass * 1.6) + ring * 0.8);
            }
            // Depth haze, tinted by the reactor glow.
            vec3 haze = uColorB * 0.1 + uColorA * (0.1 + uBass * 0.22);
            col = mix(col, haze, smoothstep(0.25, 1.0, depth));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.hull.frustumCulled = false;
    this.group.add(this.hull);
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const bass = normalizedBand(audio.bass);
    const bins = audio.bins;
    for (let i = 0; i < BANDS; i++) {
      const target = bins.length > 0 ? meterLevel(bins[logBin(i, BANDS, bins.length)]!) * 255 : 0;
      const current = this.spectrum[i]!;
      this.spectrum[i] =
        target > current ? target : current + (target - current) * Math.min(1, dt * 6);
    }
    this.spectrumTex.needsUpdate = true;

    const tempo = f.bpmConfident && audio.bpm > 0 ? audio.bpm / 120 : 1;
    this.scroll += dt * opts.stationSpeed * tempo * (14 + bass * 8);
    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) {
      this.flash = 1;
      this.chase = 0;
    }
    this.flash = Math.max(0, this.flash - dt * 2.4);
    // The chaser covers the visible corridor in about a beat.
    this.chase += dt * (f.bpmConfident && audio.bpm > 0 ? audio.bpm / 60 : 2) * 0.9;

    const palette = opts.stationUsePalette ? f.palette : REACTOR;
    const u = this.hull.material.uniforms;
    u.uColorA!.value.copy(palette[0]);
    u.uColorB!.value.copy(palette[1]);
    u.uColorC!.value.copy(palette[2]);
    u.uScroll!.value = this.scroll;
    u.uChase!.value = this.chase;
    u.uChaseOn!.value = opts.stationChase ? 1 : 0;
    u.uAmp!.value = Math.max(0.05, opts.stationAmplitude);
    u.uFlash!.value = this.flash;
    u.uBass!.value = bass;
    u.uTime!.value = time;

    if (f.xrMode) return;
    const sway = 0.5 + f.drift * 0.9;
    const targetX =
      Math.sin(time * 0.27) * sway + (opts.cameraMouse ? Math.sin(f.mouseYaw) * 2.8 : 0);
    const targetY =
      Math.sin(time * 0.21) * 0.35 * (0.5 + f.drift) +
      (opts.cameraMouse ? f.mousePitch * 1.6 - 0.4 : 0) +
      f.kick * 0.2;
    const follow = Math.min(1, dt * 4);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.position.z += (4 - camera.position.z) * follow;
    camera.fov += (74 + f.kick * 9 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    camera.lookAt(camera.position.x * 0.3, camera.position.y * 0.3, -80);
    // Bank into the sway, like a craft holding the corridor's centre line.
    this.roll +=
      (-(targetX - camera.position.x) * 0.12 - Math.sin(time * 0.27) * 0.05 * sway - this.roll) *
      Math.min(1, dt * 3);
    camera.rotateZ(this.roll);
  }

  dispose(): void {
    this.hull.geometry.dispose();
    this.hull.material.dispose();
    this.spectrumTex.dispose();
  }
}
