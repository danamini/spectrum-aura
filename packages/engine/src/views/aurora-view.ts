import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { meterLevel, logBin, type LazyView, type ViewFrame } from "./types";

const BANDS = 64;
const LAKE = 320;
/** Northern-lights triad used when "Use palette" is off. */
const BOREAL = [new THREE.Color("#3dff9a"), new THREE.Color("#0b1d4a"), new THREE.Color("#b45cff")];

/**
 * One sky for the dome and for the lake's reflection, so the water mirrors
 * exactly what is overhead: stars, the mountain line and the aurora itself.
 */
const SKY_GLSL = /* glsl */ `
  uniform sampler2D tSpectrum;
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uTime;
  uniform float uDrift;
  uniform float uAmp;
  uniform float uRays;
  uniform float uFlash;
  uniform float uBass;
  uniform float uHigh;
  const float TAU = 6.28318530718;
  float hash1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
  float hash2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise1(float x) {
    float i = floor(x), f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(hash1(i), hash1(i + 1.0), f);
  }
  float ridge(float az) {
    return 0.05 + noise1(az * 2.3 + 4.0) * 0.07 + noise1(az * 7.1) * 0.035 + noise1(az * 19.0) * 0.012;
  }
  vec3 skyColor(vec3 d) {
    float h = d.y;
    float az = atan(d.x, -d.z);
    vec3 col = mix(uColorB * 0.22, vec3(0.003, 0.006, 0.02), smoothstep(0.0, 0.7, h));
    vec2 sp = vec2(az, asin(clamp(h, -1.0, 1.0))) * 70.0;
    vec2 id = floor(sp);
    float star = step(0.982, hash2(id));
    float tw = 0.5 + 0.5 * sin(uTime * (1.5 + hash2(id + 3.0) * 4.0) + hash2(id) * 40.0);
    col += vec3(1.0) * star * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * (0.3 + tw * (0.4 + uHigh * 1.2));
    // Curtains: each one a wandering ribbon across the sky, its brightness
    // along its length set by the spectrum, hung with fine vertical rays.
    vec3 glow = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      float x = az * (1.3 + fi * 0.5) + uDrift * (0.6 + fi * 0.25) + fi * 9.1;
      float foot = 0.15 + fi * 0.085 + (noise1(x * 1.7) - 0.5) * 0.16;
      float v = h - foot;
      float level = texture2D(tSpectrum, vec2(fract(az / TAU * 2.0 + fi * 0.27 + 0.5), 0.5)).r * uAmp;
      // Sharp lower edge, long fade upward.
      float body = smoothstep(0.0, 0.025, v) * exp(-max(v, 0.0) * (5.5 - level * 2.5));
      float rays = 1.0 - uRays + uRays * (0.5 + 0.5 * sin(az * (110.0 + fi * 37.0) + noise1(x * 6.0) * 9.0 + uTime * 0.7));
      float fold = 0.45 + 0.55 * noise1(x * 4.3 + uTime * 0.15);
      vec3 tint = mix(uColorA, uColorC, clamp(v * 3.2 + fi * 0.18, 0.0, 1.0));
      glow += tint * body * rays * fold * (0.03 + level * 0.42) * (1.0 + uFlash * 0.5);
    }
    col += glow * (0.6 + uBass * 0.45);
    // Mountains in silhouette, their snow catching the light above.
    float top = ridge(az);
    float rock = smoothstep(top + 0.004, top - 0.004, h);
    vec3 mountain = vec3(0.004, 0.006, 0.012) + (uColorA * 0.5 + uColorC * 0.5) * smoothstep(top - 0.05, top, h) * 0.035 * (1.0 + uBass);
    return mix(col, mountain, rock);
  }
`;

/**
 * Northern lights over a mountain lake. The curtains' brightness follows the
 * spectrum across the sky, their height and reach follow the level, and the
 * whole display flares on the beat — all of it doubled in the water.
 */
export class AuroraView implements LazyView {
  readonly group = new THREE.Group();
  private readonly spectrum = new Uint8Array(BANDS);
  private readonly spectrumTex: THREE.DataTexture;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly lake: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private drift = 0;
  private flash = 0;
  private lastPhase = 0;
  private orbit = 0;

  constructor() {
    this.spectrumTex = new THREE.DataTexture(this.spectrum, BANDS, 1, THREE.RedFormat);
    this.spectrumTex.magFilter = THREE.LinearFilter;
    this.spectrumTex.minFilter = THREE.LinearFilter;
    this.spectrumTex.wrapS = THREE.MirroredRepeatWrapping;
    this.spectrumTex.needsUpdate = true;
    const uniforms = () => ({
      tSpectrum: { value: this.spectrumTex },
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
      uTime: { value: 0 },
      uDrift: { value: 0 },
      uAmp: { value: 1 },
      uRays: { value: 0.6 },
      uFlash: { value: 0 },
      uBass: { value: 0 },
      uHigh: { value: 0 },
    });

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(200, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: uniforms(),
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          ${SKY_GLSL}
          varying vec3 vDir;
          void main() {
            gl_FragColor = vec4(skyColor(normalize(vDir)), 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -5;

    const lakeGeo = new THREE.PlaneGeometry(LAKE * 2, LAKE * 2, 1, 1);
    lakeGeo.rotateX(-Math.PI / 2);
    this.lake = new THREE.Mesh(
      lakeGeo,
      new THREE.ShaderMaterial({
        uniforms: uniforms(),
        vertexShader: /* glsl */ `
          varying vec3 vWorld;
          void main() {
            vec4 world = modelMatrix * vec4(position, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          ${SKY_GLSL}
          varying vec3 vWorld;
          void main() {
            vec3 view = normalize(vWorld - cameraPosition);
            float dist = length(vWorld.xz - cameraPosition.xz);
            // Still water, ruffled a little more when the music is busy.
            vec2 p = vWorld.xz;
            float ruffle = 0.012 + uHigh * 0.03 + uBass * 0.012;
            vec2 slope = vec2(
              sin(p.x * 0.9 + uTime * 0.6) + sin(p.y * 1.7 - uTime * 0.8) * 0.6 + sin((p.x + p.y) * 3.1 + uTime * 1.3) * 0.3,
              cos(p.y * 1.1 + uTime * 0.5) + cos(p.x * 1.9 + uTime * 0.7) * 0.6 + cos((p.x - p.y) * 2.7 - uTime * 1.1) * 0.3
            ) * ruffle / (1.0 + dist * 0.02);
            vec3 n = normalize(vec3(slope.x, 1.0, slope.y));
            vec3 r = reflect(view, n);
            r.y = abs(r.y);
            float fresnel = 0.35 + 0.65 * pow(1.0 - max(dot(-view, n), 0.0), 3.0);
            vec3 col = skyColor(normalize(r)) * fresnel * 0.9 + uColorB * 0.012;
            // The far shore fades into the mountains' foot.
            col = mix(col, vec3(0.004, 0.006, 0.012), smoothstep(${(LAKE * 0.45).toFixed(1)}, ${(LAKE * 0.95).toFixed(1)}, dist));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.lake.frustumCulled = false;
    this.group.add(this.sky, this.lake);
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const bass = normalizedBand(audio.bass);
    const bins = audio.bins;
    // Aurora moves slowly: bands ease both ways so curtains swell and subside.
    for (let i = 0; i < BANDS; i++) {
      // A faint resting glow, so a quiet room still shows a sky rather than black.
      const level = bins.length > 0 ? meterLevel(bins[logBin(i, BANDS, bins.length)]!) : 0;
      const target = (0.3 + 0.7 * level) * 255;
      const current = this.spectrum[i]!;
      this.spectrum[i] =
        current + (target - current) * Math.min(1, dt * (target > current ? 7 : 2));
    }
    this.spectrumTex.needsUpdate = true;

    this.drift += dt * opts.auroraSpeed * (0.05 + normalizedBand(audio.mid) * 0.16);
    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 1.7);

    const palette = opts.auroraUsePalette ? f.palette : BOREAL;
    for (const material of [this.sky.material, this.lake.material]) {
      const u = material.uniforms;
      u.uColorA!.value.copy(palette[0]);
      u.uColorB!.value.copy(palette[1]);
      u.uColorC!.value.copy(palette[2]);
      u.uTime!.value = time;
      u.uDrift!.value = this.drift;
      u.uAmp!.value = Math.max(0.05, opts.auroraAmplitude) * 1.15;
      u.uRays!.value = THREE.MathUtils.clamp(opts.auroraRays, 0, 1);
      u.uFlash!.value = this.flash;
      u.uBass!.value = bass;
      u.uHigh!.value = audio.high;
    }

    if (f.xrMode) return;
    // Stand on the shore and look slowly along the sky.
    let yaw: number;
    let pitch: number;
    if (opts.cameraMouse) {
      yaw = f.mouseYaw;
      pitch = THREE.MathUtils.clamp(f.mousePitch * 0.6, -0.05, 0.9);
    } else {
      this.orbit += dt * (opts.orbitSpeed * 0.25 + 0.015);
      yaw = Math.sin(this.orbit) * 0.9;
      pitch = 0.2 + Math.sin(time * 0.07) * 0.08;
    }
    const follow = Math.min(1, dt * 3);
    camera.position.x += (0 - camera.position.x) * follow;
    camera.position.y += (2.2 + f.kick * 0.15 - camera.position.y) * follow;
    camera.position.z += (0 - camera.position.z) * follow;
    camera.fov += (72 + f.kick * 3 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    this.sky.position.copy(camera.position);
    camera.lookAt(
      camera.position.x + Math.sin(yaw) * Math.cos(pitch) * 50,
      camera.position.y + Math.sin(pitch) * 50,
      camera.position.z - Math.cos(yaw) * Math.cos(pitch) * 50,
    );
  }

  dispose(): void {
    for (const mesh of [this.sky, this.lake]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.spectrumTex.dispose();
  }
}
