import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { SPECIES, growTree, seededRandom, type GrownTree } from "./tree-grower";
import { displayLevel, logBin, type LazyView, type ViewFrame } from "./types";

const BANDS = 32;
/** Length of path before the wood repeats. */
const LENGTH = 170;
const NEAR = 14;
const PATH_HALF = 3.2;
const TREES_PER_TEMPLATE = 13;
const FIREFLIES = 420;
/** Moonlit triad used when "Use palette" is off. */
const MOONLIT = [
  new THREE.Color("#3dffb0"),
  new THREE.Color("#123a5c"),
  new THREE.Color("#8fd8ff"),
];

const WRAP_GLSL = /* glsl */ `
  float wrapZ(float z, float scroll) {
    return mod(z + scroll, ${LENGTH.toFixed(1)}) - ${(LENGTH - NEAR).toFixed(1)};
  }
`;

/** Turns a grown tree into one mesh: five-sided tubes for wood, quads for foliage. */
function treeGeometry(tree: GrownTree, seed: number): THREE.BufferGeometry {
  const rnd = seededRandom(seed);
  const positions: number[] = [];
  const data: number[] = []; // kind (0 wood, 1 leaf), sway weight, tint
  const uvs: number[] = [];
  const indices: number[] = [];
  const SIDES = 5;
  const b = tree.branches;
  for (let s = 0; s < b.length; s += 9) {
    const ax = b[s]!,
      ay = b[s + 1]!,
      az = b[s + 2]!;
    const bx = b[s + 3]!,
      by = b[s + 4]!,
      bz = b[s + 5]!;
    const level = b[s + 8]!;
    const dir = new THREE.Vector3(bx - ax, by - ay, bz - az).normalize();
    const u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(dir.x) > 0.9) u.set(0, 0, 1);
    u.cross(dir).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);
    const base = positions.length / 3;
    for (const [x, y, z, r] of [
      [ax, ay, az, b[s + 6]!],
      [bx, by, bz, b[s + 7]!],
    ] as const) {
      for (let i = 0; i < SIDES; i++) {
        const a = (i / SIDES) * Math.PI * 2;
        positions.push(
          x + (u.x * Math.cos(a) + v.x * Math.sin(a)) * r,
          y + (u.y * Math.cos(a) + v.y * Math.sin(a)) * r,
          z + (u.z * Math.cos(a) + v.z * Math.sin(a)) * r,
        );
        // Wood sways more the further out and up it is.
        data.push(0, level * 0.25 * Math.min(1, y / tree.height + 0.2), 0);
        uvs.push(0.5, 0.5);
      }
    }
    for (let i = 0; i < SIDES; i++) {
      const j = (i + 1) % SIDES;
      indices.push(
        base + i,
        base + j,
        base + SIDES + i,
        base + j,
        base + SIDES + j,
        base + SIDES + i,
      );
    }
  }
  const l = tree.leaves;
  for (let s = 0; s < l.length; s += 4) {
    const size = l[s + 3]! * 0.36;
    const normal = new THREE.Vector3(rnd() - 0.5, rnd() * 0.8 + 0.2, rnd() - 0.5).normalize();
    const u = new THREE.Vector3(1, 0, 0).cross(normal).normalize();
    const v = new THREE.Vector3().crossVectors(normal, u);
    const base = positions.length / 3;
    const tint = rnd();
    for (const [cu, cv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      positions.push(
        l[s]! + (u.x * cu + v.x * cv) * size,
        l[s + 1]! + (u.y * cu + v.y * cv) * size,
        l[s + 2]! + (u.z * cu + v.z * cv) * size,
      );
      data.push(1, 0.9, tint);
      uvs.push(cu * 0.5 + 0.5, cv * 0.5 + 0.5);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute("aData", new THREE.Float32BufferAttribute(data, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  return geo;
}

/**
 * A walk through a wood at night, grown with the same recursion as the
 * forest-world-builder project. Each tree's canopy glows with its own slice
 * of the spectrum, the wind in the branches is the mids, fireflies answer the
 * highs, and mist and moon shafts swell with the bass. The walk keeps time:
 * the path scrolls at the track's tempo with a head-bob on the beat.
 */
export class NightWoodView implements LazyView {
  readonly group = new THREE.Group();
  private readonly spectrum = new Uint8Array(BANDS);
  private readonly spectrumTex: THREE.DataTexture;
  private readonly trees: Array<THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>> =
    [];
  private readonly treeMaterial: THREE.ShaderMaterial;
  private readonly ground: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly mist: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>[] = [];
  private readonly fireflies: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private scroll = 0;
  private flash = 0;
  private lastPhase = 0;
  private wind = 0;
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

    this.treeMaterial = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: {
        ...colors(),
        tSpectrum: { value: this.spectrumTex },
        uScroll: { value: 0 },
        uTime: { value: 0 },
        uWind: { value: 0 },
        uAmp: { value: 1 },
        uFlash: { value: 0 },
      },
      vertexShader: /* glsl */ `
        ${WRAP_GLSL}
        uniform sampler2D tSpectrum;
        uniform float uScroll;
        uniform float uTime;
        uniform float uWind;
        attribute vec3 aData;
        attribute vec3 aOffset; // x, z, rotation
        attribute vec2 aInst;   // scale, spectrum band
        varying vec2 vUv;
        varying float vKind;
        varying float vTint;
        varying float vHeight;
        varying float vLevel;
        varying float vDist;
        void main() {
          float c = cos(aOffset.z), s = sin(aOffset.z);
          vec3 p = position * aInst.x;
          p.xz = mat2(c, -s, s, c) * p.xz;
          float sway = aData.y * uWind;
          float phase = uTime * 1.2 + aInst.y * 40.0 + p.y * 0.18;
          p.x += sin(phase) * sway;
          p.z += cos(phase * 0.8) * sway * 0.6;
          float z = wrapZ(aOffset.y, uScroll);
          p += vec3(aOffset.x, 0.0, z);
          vUv = uv;
          vKind = aData.x;
          vTint = aData.z;
          vHeight = position.y * aInst.x;
          vLevel = texture2D(tSpectrum, vec2(aInst.y, 0.5)).r;
          vDist = clamp(-z / ${(LENGTH - NEAR).toFixed(1)}, 0.0, 1.0);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        uniform vec3 uColorC;
        uniform float uAmp;
        uniform float uFlash;
        varying vec2 vUv;
        varying float vKind;
        varying float vTint;
        varying float vHeight;
        varying float vLevel;
        varying float vDist;
        void main() {
          vec3 moon = vec3(0.34, 0.44, 0.6);
          float level = clamp(vLevel * uAmp, 0.0, 1.3);
          vec3 col;
          if (vKind > 0.5) {
            // Foliage: soft discs rather than hard cards.
            float d = length(vUv - 0.5);
            if (d > 0.5) discard;
            vec3 leaf = mix(uColorB * 0.14, uColorA * 0.13 + moon * 0.05, vTint);
            // Each tree's crown lights with its own band, brightest at leaf centres.
            vec3 glow = mix(uColorA, uColorC, vTint) * level * (0.25 + level) * (0.14 + vTint * 0.4);
            float wave = exp(-pow((vHeight / 24.0 - (1.0 - uFlash)) * 5.0, 2.0)) * uFlash;
            col = leaf + glow * (1.0 - d * 1.2) + uColorC * wave * 0.16;
            col += moon * 0.13 * smoothstep(5.0, 20.0, vHeight);
          } else {
            // Bark: near-black, with light climbing the trunk from the roots.
            col = vec3(0.02, 0.024, 0.03) + moon * 0.06;
            col += mix(uColorA, uColorC, 0.4) * level * exp(-vHeight * 0.3) * 0.14;
          }
          vec3 fog = uColorB * 0.1 + moon * 0.035;
          gl_FragColor = vec4(mix(col, fog, smoothstep(0.15, 1.0, vDist)), 1.0);
        }
      `,
    });

    // Six individuals from three species, each instanced along both sides of the path.
    const templates: Array<[keyof typeof SPECIES, number]> = [
      ["beech", 11],
      ["beech", 23],
      ["birch", 5],
      ["birch", 41],
      ["pine", 17],
      ["pine", 29],
    ];
    const place = seededRandom(97);
    templates.forEach(([name, seed]) => {
      const base = treeGeometry(growTree(SPECIES[name], seed), seed);
      const geo = new THREE.InstancedBufferGeometry();
      geo.index = base.index;
      for (const key of ["position", "aData", "uv"]) geo.setAttribute(key, base.attributes[key]!);
      const offsets = new Float32Array(TREES_PER_TEMPLATE * 3);
      const inst = new Float32Array(TREES_PER_TEMPLATE * 2);
      for (let i = 0; i < TREES_PER_TEMPLATE; i++) {
        const side = place() < 0.5 ? -1 : 1;
        // Denser near the path, thinning into the dark.
        offsets[i * 3] = side * (PATH_HALF + 1.5 + Math.pow(place(), 1.6) * 34);
        offsets[i * 3 + 1] = place() * LENGTH;
        offsets[i * 3 + 2] = place() * Math.PI * 2;
        inst[i * 2] = 0.8 + place() * 0.45;
        inst[i * 2 + 1] = place();
      }
      geo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 3));
      geo.setAttribute("aInst", new THREE.InstancedBufferAttribute(inst, 2));
      geo.instanceCount = TREES_PER_TEMPLATE;
      const mesh = new THREE.Mesh(geo, this.treeMaterial);
      mesh.frustumCulled = false;
      this.trees.push(mesh);
      this.group.add(mesh);
    });

    const groundGeo = new THREE.PlaneGeometry(160, LENGTH + 30, 1, 1);
    groundGeo.rotateX(-Math.PI / 2);
    groundGeo.translate(0, 0, -(LENGTH + 30) / 2 + NEAR + 6);
    this.ground = new THREE.Mesh(
      groundGeo,
      new THREE.ShaderMaterial({
        uniforms: { ...colors(), uScroll: { value: 0 }, uBass: { value: 0 }, uFlash: { value: 0 } },
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
          uniform float uBass;
          uniform float uFlash;
          varying vec3 vPos;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p) {
            vec2 i = floor(p), f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
          }
          void main() {
            vec2 w = vec2(vPos.x, vPos.z + uScroll);
            float dist = clamp(-vPos.z / ${(LENGTH - NEAR).toFixed(1)}, 0.0, 1.0);
            float litter = noise(w * 0.9) * 0.6 + noise(w * 3.7) * 0.4;
            vec3 col = vec3(0.03, 0.04, 0.036) * (0.6 + litter);
            // The path: paler, winding slightly.
            float path = smoothstep(${(PATH_HALF + 1.2).toFixed(1)}, ${(PATH_HALF - 1.4).toFixed(1)}, abs(vPos.x + sin(w.y * 0.07) * 0.9));
            col += vec3(0.085, 0.095, 0.105) * path * (0.5 + litter * 0.5);
            // Moss and fungus glowing in patches, breathing with the bass.
            float patches = smoothstep(0.62, 0.9, noise(w * 0.22 + 7.0));
            col += mix(uColorA, uColorC, noise(w * 0.5)) * patches * (0.12 + uBass * 0.35) * (1.0 - path);
            float wave = exp(-pow((dist - (1.0 - uFlash)) * 8.0, 2.0)) * uFlash;
            col += uColorC * wave * 0.07;
            col = mix(col, uColorB * 0.16 + vec3(0.017, 0.022, 0.03), smoothstep(0.15, 1.0, dist));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.ground.frustumCulled = false;
    this.group.add(this.ground);

    // Mist: two drifting sheets between the trunks.
    for (const height of [1.3, 4.2]) {
      const geo = new THREE.PlaneGeometry(150, LENGTH, 1, 1);
      geo.rotateX(-Math.PI / 2);
      geo.translate(0, height, -LENGTH / 2 + NEAR);
      const sheet = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          uniforms: {
            ...colors(),
            uTime: { value: 0 },
            uBass: { value: 0 },
            uSeed: { value: height },
          },
          vertexShader: /* glsl */ `
            varying vec3 vPos;
            void main() {
              vPos = position;
              gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
          `,
          fragmentShader: /* glsl */ `
            uniform vec3 uColorB;
            uniform vec3 uColorC;
            uniform float uTime;
            uniform float uBass;
            uniform float uSeed;
            varying vec3 vPos;
            float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
            float noise(vec2 p) {
              vec2 i = floor(p), f = fract(p);
              f = f * f * (3.0 - 2.0 * f);
              return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
            }
            void main() {
              vec2 p = vPos.xz * 0.045 + vec2(uTime * 0.02, uSeed);
              float m = noise(p) * 0.6 + noise(p * 2.3 + uTime * 0.03) * 0.4;
              m = smoothstep(0.42, 0.9, m);
              float near = smoothstep(2.0, 16.0, -vPos.z + 6.0);
              vec3 col = (uColorC * 0.5 + uColorB * 0.5 + vec3(0.1, 0.13, 0.17)) * m * (0.075 + uBass * 0.14) * near;
              gl_FragColor = vec4(col, 1.0);
            }
          `,
        }),
      );
      sheet.frustumCulled = false;
      sheet.renderOrder = 2;
      this.mist.push(sheet);
      this.group.add(sheet);
    }

    const flyPositions = new Float32Array(FIREFLIES * 3);
    const flySeeds = new Float32Array(FIREFLIES);
    const fly = seededRandom(7);
    for (let i = 0; i < FIREFLIES; i++) {
      flyPositions[i * 3] = (fly() - 0.5) * 60;
      flyPositions[i * 3 + 1] = 0.3 + Math.pow(fly(), 1.7) * 9;
      flyPositions[i * 3 + 2] = fly() * LENGTH;
      flySeeds[i] = fly();
    }
    const flyGeo = new THREE.BufferGeometry();
    flyGeo.setAttribute("position", new THREE.BufferAttribute(flyPositions, 3));
    flyGeo.setAttribute("aSeed", new THREE.BufferAttribute(flySeeds, 1));
    this.fireflies = new THREE.Points(
      flyGeo,
      new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: {
          ...colors(),
          uScroll: { value: 0 },
          uTime: { value: 0 },
          uHigh: { value: 0 },
          uFlash: { value: 0 },
          uCount: { value: 1 },
        },
        vertexShader: /* glsl */ `
          ${WRAP_GLSL}
          uniform float uScroll;
          uniform float uTime;
          uniform float uHigh;
          uniform float uFlash;
          uniform float uCount;
          attribute float aSeed;
          varying float vGlow;
          varying float vSeed;
          void main() {
            vec3 p = position;
            float t = uTime * (0.3 + aSeed * 0.5) + aSeed * 60.0;
            p.x += sin(t) * 1.4;
            p.y += sin(t * 1.3 + aSeed * 9.0) * 0.7;
            p.z = wrapZ(p.z + cos(t * 0.7) * 1.2, uScroll);
            // Each one blinks on its own clock; highs and the beat wake more of them.
            float blink = smoothstep(0.55 - uHigh * 0.5 - uFlash * 0.3, 1.0, 0.5 + 0.5 * sin(uTime * (1.5 + aSeed * 3.0) + aSeed * 80.0));
            vGlow = blink * step(aSeed, uCount);
            vSeed = aSeed;
            vec4 mv = modelViewMatrix * vec4(p, 1.0);
            gl_PointSize = (90.0 + uFlash * 50.0) * (0.5 + aSeed) / max(1.0, -mv.z);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorC;
          varying float vGlow;
          varying float vSeed;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float a = smoothstep(0.5, 0.0, d);
            vec3 col = mix(uColorA, uColorC, vSeed) + vec3(0.25, 0.3, 0.1);
            gl_FragColor = vec4(col * a * a * vGlow * 1.3, 1.0);
          }
        `,
      }),
    );
    this.fireflies.frustumCulled = false;
    this.fireflies.renderOrder = 3;
    this.group.add(this.fireflies);

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
            vec3 col = mix(uColorB * 0.16 + vec3(0.017, 0.022, 0.03), vec3(0.004, 0.008, 0.02), smoothstep(-0.05, 0.6, h));
            vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(h, -1.0, 1.0))) * 60.0;
            vec2 id = floor(sp);
            float star = step(0.985, hash(id));
            float tw = 0.5 + 0.5 * sin(uTime * (1.5 + hash(id + 3.0) * 4.0) + hash(id) * 40.0);
            col += vec3(1.0) * star * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * (0.25 + tw * (0.35 + uHigh)) * smoothstep(0.15, 0.5, h);
            // The moon, off to one side above the path.
            vec2 m = vec2(d.x - 0.2, d.y - 0.52) / max(0.2, -d.z);
            float r = length(m);
            col = mix(col, vec3(0.92, 0.96, 1.0) * 0.55, smoothstep(0.075, 0.07, r));
            col += mix(uColorC, vec3(0.8, 0.9, 1.0), 0.6) * exp(-r * 6.0) * (0.14 + uBass * 0.14);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -5;
    this.group.add(this.sky);
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const bass = normalizedBand(audio.bass);
    const bins = audio.bins;
    for (let i = 0; i < BANDS; i++) {
      const target = bins.length > 0 ? displayLevel(bins[logBin(i, BANDS, bins.length)]!) * 255 : 0;
      const current = this.spectrum[i]!;
      this.spectrum[i] =
        target > current ? target : current + (target - current) * Math.min(1, dt * 3);
    }
    this.spectrumTex.needsUpdate = true;

    // A walking pace that keeps the track's time.
    const tempo = f.bpmConfident && audio.bpm > 0 ? audio.bpm / 120 : 1;
    this.scroll = (this.scroll + dt * opts.nightwoodSpeed * tempo * 2.6) % LENGTH;
    this.wind += (0.08 + normalizedBand(audio.mid) * 0.5 - this.wind) * Math.min(1, dt * 2);

    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 1.6);

    const palette = opts.nightwoodUsePalette ? f.palette : MOONLIT;
    const materials = [
      this.treeMaterial,
      this.ground.material,
      this.fireflies.material,
      this.sky.material,
      ...this.mist.map((sheet) => sheet.material),
    ];
    for (const material of materials) {
      material.uniforms.uColorA!.value.copy(palette[0]);
      material.uniforms.uColorB!.value.copy(palette[1]);
      material.uniforms.uColorC!.value.copy(palette[2]);
      if (material.uniforms.uTime) material.uniforms.uTime.value = time;
      if (material.uniforms.uScroll) material.uniforms.uScroll.value = this.scroll;
      if (material.uniforms.uBass) material.uniforms.uBass.value = bass;
      if (material.uniforms.uFlash) material.uniforms.uFlash.value = this.flash;
      if (material.uniforms.uHigh) material.uniforms.uHigh.value = audio.high;
    }
    this.treeMaterial.uniforms.uWind!.value = this.wind;
    this.treeMaterial.uniforms.uAmp!.value = Math.max(0.05, opts.nightwoodAmplitude) * 1.2;
    this.fireflies.material.uniforms.uCount!.value = THREE.MathUtils.clamp(
      opts.nightwoodFireflies,
      0,
      1,
    );

    if (f.xrMode) return;
    const sway = f.drift * 0.7;
    const targetX =
      Math.sin(time * 0.23) * sway + (opts.cameraMouse ? Math.sin(f.mouseYaw) * 2.4 : 0);
    // Head-bob: one step per beat when the tempo is known.
    const bob = f.bpmConfident ? Math.sin(f.beatPhase * Math.PI * 2) * 0.05 : 0;
    const targetY = 1.75 + bob + f.kick * 0.12;
    const follow = Math.min(1, dt * 4);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * Math.min(1, dt * 9);
    camera.position.z += (6 - camera.position.z) * follow;
    camera.fov += (64 + f.kick * 4 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    this.sky.position.copy(camera.position);
    const lookUp = opts.cameraMouse ? Math.max(-0.2, f.mousePitch) * 26 : 0;
    this.look.set(camera.position.x * 0.4 + Math.sin(time * 0.11) * 1.5, 4.5 + lookUp, -40);
    camera.lookAt(this.look);
  }

  dispose(): void {
    for (const mesh of this.trees) mesh.geometry.dispose();
    this.treeMaterial.dispose();
    for (const mesh of [this.ground, this.fireflies, this.sky, ...this.mist]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.spectrumTex.dispose();
  }
}
