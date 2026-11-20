import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { meterLevel, logBin, type LazyView, type ViewFrame } from "./types";

const COLS = 64;
const ROWS = 96;
const WIDTH = 220;
const DEPTH = 230;
const CELL = DEPTH / ROWS;
const ROAD_HALF = 5;
const POLES = 26;
const POLE_SPACING = DEPTH / (POLES / 2);
/** Sunset triad used when "Use palette" is off. */
const SUNSET = [new THREE.Color("#ff8a3d"), new THREE.Color("#5a1e6b"), new THREE.Color("#ffd27a")];

/**
 * A desert road at sundown. The dunes either side are shaped by the last few
 * seconds of spectrum and roll past at the track's tempo; low sun rakes
 * across them, so every ridge has a lit face and a long shadow. Telegraph
 * poles tick past for speed, and the sun swells on the kick.
 *
 * One displaced plane, lit per facet from screen-space derivatives.
 */
export class DesertView implements LazyView {
  readonly group = new THREE.Group();
  private readonly history = new Uint8Array(COLS * ROWS);
  private readonly historyTex: THREE.DataTexture;
  private readonly dunes: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly poles: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private scroll = 0;
  private travel = 0;
  private flash = 0;
  private lastPhase = 0;
  private readonly look = new THREE.Vector3();

  constructor() {
    this.historyTex = new THREE.DataTexture(this.history, COLS, ROWS, THREE.RedFormat);
    this.historyTex.magFilter = THREE.LinearFilter;
    this.historyTex.minFilter = THREE.LinearFilter;
    this.historyTex.needsUpdate = true;
    const colors = () => ({
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
    });

    const geo = new THREE.PlaneGeometry(WIDTH, DEPTH, 200, ROWS * 2);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -DEPTH / 2 + 12);
    this.dunes = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          ...colors(),
          tHistory: { value: this.historyTex },
          uScroll: { value: 0 },
          uTravel: { value: 0 },
          uAmp: { value: 1 },
          uFlash: { value: 0 },
          uBass: { value: 0 },
        },
        vertexShader: /* glsl */ `
          uniform sampler2D tHistory;
          uniform float uScroll;
          uniform float uTravel;
          uniform float uAmp;
          varying vec3 vWorld;
          varying vec3 vPos;
          varying float vLevel;
          void main() {
            vec3 p = position;
            float flank = abs(p.x);
            float rise = smoothstep(${ROAD_HALF.toFixed(1)}, ${(ROAD_HALF + 20).toFixed(1)}, flank);
            // Big, slow dune forms that travel with the road.
            float w = p.z + uTravel;
            float dune = sin(flank * 0.07 + w * 0.045) * 0.5 + sin(flank * 0.031 - w * 0.027 + 1.7) * 0.5;
            dune = dune * 0.5 + 0.5;
            // The spectrum's recent past, sharpening them into ridges.
            float depth = clamp((12.0 - p.z) / ${DEPTH.toFixed(1)}, 0.0, 1.0);
            float u = clamp((flank - ${ROAD_HALF.toFixed(1)}) / ${(WIDTH / 2 - ROAD_HALF).toFixed(1)}, 0.0, 1.0);
            float level = texture2D(tHistory, vec2(u, clamp(1.0 - depth - uScroll / ${ROWS.toFixed(1)}, 0.0, 1.0))).r;
            p.y += rise * (dune * (4.5 + flank * 0.1) + level * (3.5 + flank * 0.12) * uAmp);
            vLevel = level * rise;
            vPos = p;
            vec4 world = modelMatrix * vec4(p, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          uniform float uScroll;
          uniform float uFlash;
          uniform float uBass;
          varying vec3 vWorld;
          varying vec3 vPos;
          varying float vLevel;
          // The sun sits ahead, but its light is taken from one side so every dune
          // has a lit face and a shadowed one instead of a plain silhouette.
          const vec3 SUN = vec3(-0.6, 0.42, -0.68);
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
            n *= sign(n.y + 1e-5);
            float dist = clamp(-vPos.z / ${(DEPTH - 12).toFixed(1)}, 0.0, 1.0);
            float z = vPos.z + uScroll * ${CELL.toFixed(4)};
            // Low sun: faces turned to it glow, faces turned away fall into
            // the palette's shadow colour.
            float lit = max(dot(n, SUN), 0.0);
            float facing = smoothstep(0.0, 0.75, lit);
            vec3 sand = mix(uColorB * 0.42 + uColorA * 0.08, mix(uColorA, uColorC, 0.4), facing);
            // Wind ripples across the sand.
            sand *= 0.86 + 0.14 * sin(vPos.x * 2.6 + sin(z * 0.6) * 1.5);
            // Crests catch the light.
            sand += uColorC * smoothstep(0.55, 1.0, vLevel) * 0.35;
            vec3 col = sand * (0.72 + uBass * 0.25);
            float ax = abs(vPos.x);
            float road = smoothstep(${(ROAD_HALF + 0.4).toFixed(1)}, ${(ROAD_HALF - 0.2).toFixed(1)}, ax);
            vec3 tarmac = uColorB * 0.07 + vec3(0.012);
            // Sand blown across the road in streaks.
            tarmac += mix(uColorA, uColorC, 0.4) * 0.08 * smoothstep(0.6, 1.0, hash(floor(vec2(vPos.x * 1.4, z * 0.25))));
            float w = fwidth(vPos.x) * 1.5;
            float centre = smoothstep(0.12 + w, 0.12, ax) * step(0.45, fract(z / 6.0));
            float edge = smoothstep(0.1 + w, 0.1, abs(ax - ${(ROAD_HALF - 0.6).toFixed(1)}));
            tarmac += vec3(1.0, 0.9, 0.6) * (centre * 0.6 + edge * 0.35);
            col = mix(col, tarmac, road);
            float wave = exp(-pow((dist - (1.0 - uFlash)) * 9.0, 2.0)) * uFlash;
            col += uColorC * wave * 0.14;
            // Dust haze toward the horizon.
            col = mix(col, uColorA * 0.5 + uColorB * 0.12, smoothstep(0.45, 1.0, dist));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.dunes.frustumCulled = false;

    // Telegraph poles: a post and a crossbar, instanced down both verges.
    const post = new THREE.BoxGeometry(0.16, 7, 0.16).translate(0, 3.5, 0);
    const bar = new THREE.BoxGeometry(1.8, 0.12, 0.12).translate(0, 6.3, 0);
    const poleGeo = new THREE.InstancedBufferGeometry();
    const positions = new Float32Array([
      ...(post.attributes.position!.array as Float32Array),
      ...(bar.attributes.position!.array as Float32Array),
    ]);
    const postIndex = Array.from(post.index!.array);
    const barIndex = Array.from(bar.index!.array).map((i) => i + post.attributes.position!.count);
    poleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    poleGeo.setIndex([...postIndex, ...barIndex]);
    const offsets = new Float32Array(POLES * 2);
    for (let i = 0; i < POLES; i++) {
      offsets[i * 2] = (i % 2 === 0 ? -1 : 1) * (ROAD_HALF + 2.2);
      offsets[i * 2 + 1] = Math.floor(i / 2) * POLE_SPACING + (i % 2) * POLE_SPACING * 0.5;
    }
    poleGeo.setAttribute("aOffset", new THREE.InstancedBufferAttribute(offsets, 2));
    poleGeo.instanceCount = POLES;
    post.dispose();
    bar.dispose();
    this.poles = new THREE.Mesh(
      poleGeo,
      new THREE.ShaderMaterial({
        uniforms: { ...colors(), uScroll: { value: 0 } },
        vertexShader: /* glsl */ `
          uniform float uScroll;
          attribute vec2 aOffset;
          varying float vDist;
          varying float vY;
          void main() {
            float z = mod(aOffset.y + uScroll * ${CELL.toFixed(4)}, ${DEPTH.toFixed(1)}) - ${(DEPTH - 12).toFixed(1)};
            vec3 p = position + vec3(aOffset.x, 0.0, z);
            vDist = clamp(-z / ${(DEPTH - 12).toFixed(1)}, 0.0, 1.0);
            vY = position.y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          varying float vDist;
          varying float vY;
          void main() {
            // Silhouettes against the sunset, rim-lit near the top.
            vec3 col = uColorB * 0.05 + uColorA * 0.08 * smoothstep(3.0, 7.0, vY);
            gl_FragColor = vec4(mix(col, uColorA * 0.5 + uColorB * 0.12, smoothstep(0.45, 1.0, vDist)), 1.0);
          }
        `,
      }),
    );
    this.poles.frustumCulled = false;

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(190, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          ...colors(),
          uTime: { value: 0 },
          uBass: { value: 0 },
          uHigh: { value: 0 },
          uFlash: { value: 0 },
          uSun: { value: 1 },
        },
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
          uniform float uBass;
          uniform float uHigh;
          uniform float uFlash;
          uniform float uSun;
          varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = mix(uColorA * 0.6 + uColorC * 0.12, uColorB * 0.5, smoothstep(0.0, 0.34, h));
            col = mix(col, uColorB * 0.1 + vec3(0.0, 0.0, 0.025), smoothstep(0.25, 0.9, h));
            // A huge sun low on the road's vanishing point, wobbling in the heat.
            float shimmer = sin(h * 240.0 + uTime * 5.0) * 0.004 * smoothstep(0.2, 0.0, h);
            vec2 s = vec2(d.x + shimmer, d.y - 0.16) / max(0.2, -d.z);
            float r = length(s);
            float radius = 0.26 * (1.0 + uBass * 0.06 + uFlash * 0.04);
            float disc = smoothstep(radius, radius - 0.006, r);
            vec3 sunCol = mix(uColorA, uColorC, smoothstep(-0.2, 0.25, s.y));
            col = mix(col, sunCol * 0.6, disc * uSun);
            col += sunCol * exp(-r * 4.0) * 0.26 * uSun * (0.8 + uBass * 0.6);
            vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(h, -1.0, 1.0))) * 60.0;
            vec2 id = floor(sp);
            float star = step(0.99, hash(id));
            col += vec3(1.0) * star * smoothstep(0.42, 0.0, length(fract(sp) - 0.5)) * (0.3 + uHigh) * smoothstep(0.4, 0.8, h);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -5;
    this.group.add(this.sky, this.dunes, this.poles);
  }

  private pushRow(audio: ViewFrame["audio"]) {
    this.history.copyWithin(COLS, 0, COLS * (ROWS - 1));
    const bins = audio.bins;
    for (let c = 0; c < COLS; c++) {
      const byte = bins.length > 0 ? bins[logBin(c, COLS, bins.length)]! : 0;
      this.history[c] = Math.round(meterLevel(byte) * 255);
    }
    this.historyTex.needsUpdate = true;
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const bass = normalizedBand(audio.bass);
    const tempo = f.bpmConfident && audio.bpm > 0 ? audio.bpm / 120 : 1;
    const speed = dt * opts.desertSpeed * tempo * (12 + bass * 5);
    this.scroll += speed;
    this.travel += speed * CELL;
    while (this.scroll >= 1) {
      this.scroll -= 1;
      this.pushRow(audio);
    }
    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 1.9);

    const palette = opts.desertUsePalette ? f.palette : SUNSET;
    for (const material of [this.dunes.material, this.poles.material, this.sky.material]) {
      material.uniforms.uColorA!.value.copy(palette[0]);
      material.uniforms.uColorB!.value.copy(palette[1]);
      material.uniforms.uColorC!.value.copy(palette[2]);
    }
    const dunes = this.dunes.material.uniforms;
    dunes.uScroll!.value = this.scroll;
    dunes.uTravel!.value = this.travel;
    dunes.uAmp!.value = Math.max(0.05, opts.desertAmplitude);
    dunes.uFlash!.value = this.flash;
    dunes.uBass!.value = bass;
    // Poles ride the same distance as the dunes, in whole metres.
    this.poles.material.uniforms.uScroll!.value = this.travel / CELL;
    const sky = this.sky.material.uniforms;
    sky.uTime!.value = time;
    sky.uBass!.value = bass;
    sky.uHigh!.value = audio.high;
    sky.uFlash!.value = this.flash;
    sky.uSun!.value = opts.desertSun ? 1 : 0;

    if (f.xrMode) return;
    const sway = f.drift * 1.4;
    const targetX =
      Math.sin(time * 0.2) * sway + (opts.cameraMouse ? Math.sin(f.mouseYaw) * 3.5 : 0);
    const targetY =
      2.3 +
      Math.sin(time * 0.3) * 0.25 * (0.4 + f.drift) +
      (opts.cameraMouse ? Math.max(0, f.mousePitch) * 8 : 0) +
      f.kick * 0.5;
    const follow = Math.min(1, dt * 4);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.position.z += (10 - camera.position.z) * follow;
    camera.fov += (70 + f.kick * 6 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    this.sky.position.copy(camera.position);
    this.look.set(camera.position.x * 0.6, 3.2, -60);
    camera.lookAt(this.look);
  }

  dispose(): void {
    for (const mesh of [this.dunes, this.poles, this.sky]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.historyTex.dispose();
  }
}
