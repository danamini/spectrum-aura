import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { meterLevel, logBin, type LazyView, type ViewFrame } from "./types";

const BANDS = 64;
/** Length of avenue before buildings recycle. */
const AVENUE = 220;
const ROWS = 34; // buildings along each side, per lane
const LANES = 3; // rows of buildings stepping back from the street
const STREET_HALF = 7;
/** Neon triad used when "Use palette" is off. */
const NIGHT = [new THREE.Color("#ff3df0"), new THREE.Color("#3a2bff"), new THREE.Color("#21e6ff")];

/** Deterministic 0–1 hash so the skyline is the same every time it is built. */
function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * A night drive down a neon avenue. Every building is an equaliser: its
 * windows light floor by floor with its own slice of the spectrum, so the
 * skyline is the music. The city scrolls at the track's tempo and a wave of
 * light runs up the towers on each beat.
 *
 * All buildings are one instanced draw. Their positions are wrapped in the
 * vertex shader from a single scroll uniform, and their levels come from a
 * 64-texel spectrum texture, so a frame costs one small texture upload and no
 * per-building CPU work.
 */
export class NeonCityView implements LazyView {
  readonly group = new THREE.Group();
  private readonly spectrum = new Uint8Array(BANDS);
  private readonly spectrumTex: THREE.DataTexture;
  private readonly city: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly street: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private scroll = 0;
  private flash = 0;
  private lastPhase = 0;
  private readonly look = new THREE.Vector3();

  constructor() {
    this.spectrumTex = new THREE.DataTexture(this.spectrum, BANDS, 1, THREE.RedFormat);
    this.spectrumTex.magFilter = THREE.LinearFilter;
    this.spectrumTex.minFilter = THREE.LinearFilter;
    this.spectrumTex.needsUpdate = true;

    const colors = () => ({
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
    });

    // One unit box, base on the ground, instanced per building.
    const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = box.index;
    geo.setAttribute("position", box.attributes.position!);
    geo.setAttribute("normal", box.attributes.normal!);
    const count = ROWS * LANES * 2;
    const offsets = new Float32Array(count * 2); // x, z along the avenue
    const sizes = new Float32Array(count * 3);
    const seeds = new Float32Array(count * 2); // random seed, spectrum band
    let i = 0;
    for (let side = 0; side < 2; side++) {
      for (let lane = 0; lane < LANES; lane++) {
        let z = hash(side * 7 + lane * 13) * 4;
        for (let row = 0; row < ROWS; row++) {
          const r = hash(i + 1);
          const width = 3.2 + hash(i + 50) * 3.4;
          const depth = 3.4 + hash(i + 90) * 3.2;
          // Towers get taller further back, like a real skyline.
          const height = (5 + r * 13) * (1 + lane * 0.75) + (hash(i + 7) > 0.9 ? 16 : 0);
          const lateral = STREET_HALF + lane * 9.5 + width / 2 + hash(i + 31) * 1.6;
          offsets[i * 2] = (side === 0 ? -1 : 1) * lateral;
          offsets[i * 2 + 1] = z;
          sizes[i * 3] = width;
          sizes[i * 3 + 1] = height;
          sizes[i * 3 + 2] = depth;
          seeds[i * 2] = r * 97.3 + side * 13.1;
          seeds[i * 2 + 1] = hash(i + 200);
          z += AVENUE / ROWS;
          i++;
        }
      }
    }
    geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 2));
    geo.setAttribute("aSize", new THREE.InstancedBufferAttribute(sizes, 3));
    geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 2));
    geo.instanceCount = count;
    box.dispose();

    this.city = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          ...colors(),
          tSpectrum: { value: this.spectrumTex },
          uScroll: { value: 0 },
          uAmp: { value: 1 },
          uFlash: { value: 0 },
          uDensity: { value: 0.6 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          uniform sampler2D tSpectrum;
          uniform float uScroll;
          attribute vec2 aOffset;
          attribute vec3 aSize;
          attribute vec2 aSeed;
          varying vec3 vLocal;
          varying vec3 vSize;
          varying vec3 vNormalL;
          varying float vSeed;
          varying float vLevel;
          varying float vDist;
          void main() {
            // Wrap along the avenue: buildings pass the camera and rejoin the far end.
            float z = mod(aOffset.y + uScroll, ${AVENUE.toFixed(1)}) - ${(AVENUE - 14).toFixed(1)};
            vec3 p = position * aSize + vec3(aOffset.x, 0.0, z);
            vLocal = position;
            vSize = aSize;
            vNormalL = normal;
            vSeed = aSeed.x;
            vLevel = texture2D(tSpectrum, vec2(aSeed.y, 0.5)).r;
            vDist = clamp(-z / ${(AVENUE - 14).toFixed(1)}, 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          uniform float uAmp;
          uniform float uFlash;
          uniform float uDensity;
          uniform float uTime;
          varying vec3 vLocal;
          varying vec3 vSize;
          varying vec3 vNormalL;
          varying float vSeed;
          varying float vLevel;
          varying float vDist;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 body = uColorB * 0.035;
            vec3 col = body;
            float height = vLocal.y * vSize.y;
            if (abs(vNormalL.y) < 0.5) {
              // A wall: lay out windows in metres so every tower shares one scale.
              float across = abs(vNormalL.x) > 0.5 ? (vLocal.z + 0.5) * vSize.z : (vLocal.x + 0.5) * vSize.x;
              vec2 cell = vec2(across / 1.05, height / 1.25);
              vec2 id = floor(cell);
              vec2 f = fract(cell);
              float pane = step(0.2, f.x) * step(f.x, 0.8) * step(0.22, f.y) * step(f.y, 0.78);
              float face = abs(vNormalL.x) > 0.5 ? 3.0 : 7.0;
              float r = hash(id + vSeed + face);
              // The equaliser: floors light from the ground up to this tower's level.
              float lit = clamp(vLevel * uAmp, 0.0, 1.0) * vSize.y;
              float inMeter = step(height, lit);
              float occupied = step(r, uDensity);
              // A few windows stay on above the meter so quiet towers are not blank.
              float ambient = step(r, 0.07);
              float on = pane * max(occupied * inMeter, ambient);
              // Beat wave climbing the tower.
              float wave = exp(-pow((vLocal.y - (1.0 - uFlash)) * 7.0, 2.0)) * uFlash;
              vec3 glass = mix(uColorA, uColorC, hash(id.yx + vSeed));
              glass = mix(glass, vec3(1.0, 0.92, 0.75), step(0.88, r));
              float flicker = 0.85 + 0.15 * sin(uTime * (2.0 + r * 5.0) + r * 40.0);
              col += glass * on * (0.55 + inMeter * 0.75 + wave * 1.6) * flicker;
              // The top lit floor burns brightest, like a level meter's peak.
              col += glass * pane * occupied * exp(-abs(height - lit) * 1.4) * inMeter * 0.9;
              // Neon trim up the corners.
              float edge = smoothstep(0.42, 0.5, abs(abs(vNormalL.x) > 0.5 ? vLocal.z : vLocal.x));
              col += uColorC * edge * (0.1 + wave * 0.8 + vLevel * 0.25);
            } else {
              // Roof: rim light and the odd beacon.
              float rim = smoothstep(0.4, 0.5, max(abs(vLocal.x), abs(vLocal.z)));
              col += uColorA * rim * (0.25 + vLevel * 0.9 + uFlash * 0.6);
            }
            // Distance haze toward the horizon glow.
            col = mix(col, uColorA * 0.16 + uColorB * 0.08, smoothstep(0.35, 1.0, vDist));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.city.frustumCulled = false;

    const streetGeo = new THREE.PlaneGeometry(260, AVENUE + 40, 1, 1);
    streetGeo.rotateX(-Math.PI / 2);
    streetGeo.translate(0, 0, -(AVENUE + 40) / 2 + 20);
    this.street = new THREE.Mesh(
      streetGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          ...colors(),
          uScroll: { value: 0 },
          uFlash: { value: 0 },
          uBass: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vPos;
          void main() {
            vPos = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          uniform float uScroll;
          uniform float uFlash;
          uniform float uBass;
          varying vec3 vPos;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            float ax = abs(vPos.x);
            float z = vPos.z + uScroll;
            float dist = clamp(-vPos.z / ${AVENUE.toFixed(1)}, 0.0, 1.0);
            // Wet asphalt: dark, with the towers' glow smeared down it.
            float sheen = 0.5 + 0.5 * hash(floor(vec2(vPos.x * 0.7, z * 0.18)));
            vec3 col = uColorB * 0.03;
            float kerb = smoothstep(${(STREET_HALF + 3).toFixed(1)}, ${STREET_HALF.toFixed(1)}, ax);
            col += mix(uColorA, uColorC, 0.5 + 0.5 * sin(z * 0.11)) * (1.0 - kerb) * 0.07 * sheen;
            col += uColorA * exp(-abs(ax - ${STREET_HALF.toFixed(1)}) * 0.55) * (0.12 + uBass * 0.25) * sheen;
            // Dashed centre line and solid edge lines, anti-aliased.
            float w = fwidth(vPos.x) * 1.5;
            float centre = smoothstep(0.11 + w, 0.11, ax) * step(0.5, fract(z / 5.0));
            float edgeLine = smoothstep(0.1 + w, 0.1, abs(ax - ${(STREET_HALF - 0.7).toFixed(1)}));
            col += vec3(1.0, 0.93, 0.7) * centre * 0.5 * kerb;
            col += uColorC * edgeLine * (0.45 + uBass * 0.5) * kerb;
            // Beat band rolling out ahead of the car.
            float wave = exp(-pow((dist - (1.0 - uFlash)) * 9.0, 2.0)) * uFlash;
            col += uColorC * wave * 0.22 * kerb;
            col = mix(col, uColorA * 0.16 + uColorB * 0.08, smoothstep(0.35, 1.0, dist));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.street.frustumCulled = false;

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { ...colors(), uTime: { value: 0 }, uHigh: { value: 0 }, uBass: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          uniform float uTime;
          uniform float uHigh;
          uniform float uBass;
          varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            // City glow on the horizon fading into a deep night sky.
            vec3 col = mix(uColorA * 0.3 + uColorB * 0.12, uColorB * 0.07, smoothstep(-0.02, 0.4, h));
            col = mix(col, vec3(0.004, 0.004, 0.02), smoothstep(0.3, 0.9, h));
            vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(h, -1.0, 1.0))) * 60.0;
            vec2 id = floor(sp);
            float star = step(0.988, hash(id));
            float tw = 0.5 + 0.5 * sin(uTime * (1.5 + hash(id + 3.0) * 4.0) + hash(id) * 40.0);
            float pt = smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
            col += vec3(1.0) * star * pt * (0.3 + tw * (0.4 + uHigh * 1.4)) * smoothstep(0.12, 0.45, h);
            // A large moon over the end of the avenue.
            vec2 m = vec2(d.x + 0.16, d.y - 0.36) / max(0.2, -d.z);
            float r = length(m);
            float disc = smoothstep(0.105, 0.1, r);
            float craters = 0.82 + 0.18 * hash(floor(m * 46.0));
            col = mix(col, mix(uColorC, vec3(1.0), 0.75) * craters * 0.5, disc);
            col += mix(uColorC, vec3(1.0), 0.5) * exp(-r * 7.5) * (0.16 + uBass * 0.12);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -5;
    this.group.add(this.sky, this.street, this.city);
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const bass = normalizedBand(audio.bass);
    const bins = audio.bins;
    // Each band eases toward its level so towers rise fast and settle slowly.
    for (let i = 0; i < BANDS; i++) {
      const target = bins.length > 0 ? meterLevel(bins[logBin(i, BANDS, bins.length)]!) * 255 : 0;
      const current = this.spectrum[i]!;
      this.spectrum[i] =
        target > current ? target : current + (target - current) * Math.min(1, dt * 5);
    }
    this.spectrumTex.needsUpdate = true;

    const tempo = f.bpmConfident && audio.bpm > 0 ? audio.bpm / 120 : 1;
    this.scroll = (this.scroll + dt * opts.neoncitySpeed * tempo * (11 + bass * 6)) % AVENUE;

    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 1.8);

    const palette = opts.neoncityUsePalette ? f.palette : NIGHT;
    for (const material of [this.city.material, this.street.material, this.sky.material]) {
      material.uniforms.uColorA!.value.copy(palette[0]);
      material.uniforms.uColorB!.value.copy(palette[1]);
      material.uniforms.uColorC!.value.copy(palette[2]);
    }
    const city = this.city.material.uniforms;
    city.uScroll!.value = this.scroll;
    city.uAmp!.value = Math.max(0.05, opts.neoncityAmplitude) * 1.25;
    city.uFlash!.value = this.flash;
    city.uDensity!.value = THREE.MathUtils.clamp(opts.neoncityDensity, 0.05, 1);
    city.uTime!.value = time;
    const street = this.street.material.uniforms;
    street.uScroll!.value = this.scroll;
    street.uFlash!.value = this.flash;
    street.uBass!.value = bass;
    const sky = this.sky.material.uniforms;
    sky.uTime!.value = time;
    sky.uHigh!.value = audio.high;
    sky.uBass!.value = bass;

    if (f.xrMode) return;
    const sway = f.drift * 1.3;
    const targetX =
      Math.sin(time * 0.19) * sway + (opts.cameraMouse ? Math.sin(f.mouseYaw) * 4.5 : 0);
    const targetY =
      2.4 +
      Math.sin(time * 0.31) * 0.3 * (0.4 + f.drift) +
      (opts.cameraMouse ? Math.max(0, f.mousePitch) * 14 : 0) +
      f.kick * 0.5;
    const follow = Math.min(1, dt * 4);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.position.z += (10 - camera.position.z) * follow;
    camera.fov += (68 + f.kick * 6 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    this.sky.position.copy(camera.position);
    // Look up the avenue, tilting toward the tower tops as the camera rises.
    this.look.set(camera.position.x * 0.5, 4.5 + camera.position.y * 0.35, -70);
    camera.lookAt(this.look);
  }

  dispose(): void {
    for (const mesh of [this.city, this.street, this.sky]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.spectrumTex.dispose();
  }
}
