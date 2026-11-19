import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { displayLevel, logBin, type LazyView, type ViewFrame } from "./types";

const COLS = 64; // spectrum columns across each mountain flank
const ROWS = 96; // history rows receding to the horizon
const FLOOR_WIDTH = 150;
const FLOOR_DEPTH = 190;
const CELL = FLOOR_DEPTH / ROWS;

/** Fixed neon triad used when "Use palette" is off. */
const CLASSIC = [
  new THREE.Color("#ff2bd6"),
  new THREE.Color("#7a2cff"),
  new THREE.Color("#19f0ff"),
];

/**
 * Synthwave drive: a scrolling neon grid whose flanks rise into mountains
 * built from spectrum history, under a striped sun and a starfield.
 *
 * The terrain is one plane displaced in the vertex shader from a small
 * history texture, so new audio costs a 64-byte row upload rather than a
 * CPU pass over every vertex.
 */
export class OutrunView implements LazyView {
  readonly group = new THREE.Group();
  private readonly history = new Uint8Array(COLS * ROWS);
  private readonly historyTex: THREE.DataTexture;
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private scroll = 0;
  private flash = 0;
  private lastPhase = 0;
  private readonly look = new THREE.Vector3();

  constructor() {
    this.historyTex = new THREE.DataTexture(this.history, COLS, ROWS, THREE.RedFormat);
    this.historyTex.magFilter = THREE.LinearFilter;
    this.historyTex.minFilter = THREE.LinearFilter;
    this.historyTex.wrapS = THREE.ClampToEdgeWrapping;
    this.historyTex.wrapT = THREE.ClampToEdgeWrapping;
    this.historyTex.needsUpdate = true;

    const colors = () => ({
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
    });

    const floorGeo = new THREE.PlaneGeometry(FLOOR_WIDTH, FLOOR_DEPTH, 150, ROWS);
    floorGeo.rotateX(-Math.PI / 2);
    // Camera sits near the plane's near edge looking down -Z.
    floorGeo.translate(0, 0, -FLOOR_DEPTH / 2 + 12);
    this.floor = new THREE.Mesh(
      floorGeo,
      new THREE.ShaderMaterial({
        uniforms: {
          ...colors(),
          tHistory: { value: this.historyTex },
          uScroll: { value: 0 },
          uAmp: { value: 1 },
          uFlash: { value: 0 },
          uBass: { value: 0 },
        },
        vertexShader: /* glsl */ `
          uniform sampler2D tHistory;
          uniform float uScroll;
          uniform float uAmp;
          varying vec3 vPos;
          varying float vHeight;
          const float ROAD = 7.0;
          void main() {
            vec3 p = position;
            // Row 0 is the horizon; rows advance toward the camera with uScroll.
            float depth = clamp((12.0 - p.z) / ${FLOOR_DEPTH.toFixed(1)}, 0.0, 1.0);
            float v = 1.0 - depth - uScroll / ${ROWS.toFixed(1)};
            float flank = abs(p.x);
            float u = clamp((flank - ROAD) / ${(FLOOR_WIDTH / 2 - 7).toFixed(1)}, 0.0, 1.0);
            float level = texture2D(tHistory, vec2(u, clamp(v, 0.0, 1.0))).r;
            // Flat road in the middle, flanks swell with distance from it.
            float rise = smoothstep(ROAD, ROAD + 16.0, flank);
            float ridge = 0.55 + 0.45 * sin(flank * 0.37 + p.z * 0.11);
            p.y += level * rise * (5.0 + flank * 0.22) * uAmp * ridge;
            vHeight = p.y;
            vPos = p;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
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
          varying float vHeight;
          void main() {
            // Grid in world cells; z scrolls with the terrain so lines and
            // ridges stay locked together.
            vec2 cell = vec2(vPos.x / ${CELL.toFixed(4)}, (vPos.z - uScroll * ${CELL.toFixed(4)}) / ${CELL.toFixed(4)});
            vec2 g = abs(fract(cell - 0.5) - 0.5) / fwidth(cell);
            float line = 1.0 - min(min(g.x, g.y), 1.0);
            // Toward the horizon cells shrink below a pixel; without this the
            // lines merge into a solid sheet.
            vec2 fw = fwidth(cell);
            line *= clamp(1.0 - max(fw.x, fw.y) * 1.15, 0.1, 1.0);
            float dist = clamp(-vPos.z / ${(FLOOR_DEPTH - 12).toFixed(1)}, 0.0, 1.0);
            vec3 lineCol = mix(uColorC, uColorA, smoothstep(0.0, 6.0, vHeight));
            vec3 fill = mix(uColorB * 0.07, uColorA * 0.16, smoothstep(0.0, 9.0, vHeight));
            // A bright band rolls out from the camera on every beat.
            float wave = exp(-pow((dist - (1.0 - uFlash)) * 9.0, 2.0)) * uFlash;
            vec3 col = fill + lineCol * line * (0.85 + uBass * 1.1 + wave * 2.2);
            col += uColorC * wave * 0.12;
            // Fade into the horizon glow rather than a hard far edge.
            float haze = smoothstep(0.72, 1.0, dist);
            col = mix(col, uColorA * 0.2, haze);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.floor.frustumCulled = false;

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(180, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: {
          ...colors(),
          uTime: { value: 0 },
          uSun: { value: 1 },
          uBass: { value: 0 },
          uHigh: { value: 0 },
          uFlash: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          uniform float uTime;
          uniform float uSun;
          uniform float uBass;
          uniform float uHigh;
          uniform float uFlash;
          varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            float h = d.y;
            vec3 col = mix(uColorA * 0.3, uColorB * 0.14, smoothstep(-0.02, 0.45, h));
            col = mix(col, vec3(0.005, 0.0, 0.02), smoothstep(0.35, 0.95, h));
            // Stars: hashed cells on the direction sphere, twinkling with highs.
            vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(h, -1.0, 1.0))) * 60.0;
            vec2 id = floor(sp);
            float star = step(0.985, hash(id));
            float tw = 0.5 + 0.5 * sin(uTime * (1.5 + hash(id + 3.0) * 4.0) + hash(id) * 40.0);
            float pt = smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
            col += vec3(1.0) * star * pt * (0.35 + tw * (0.5 + uHigh * 1.6)) * smoothstep(0.08, 0.4, h);
            // Sun sits on the -Z axis, low over the horizon.
            vec2 s = vec2(d.x, d.y - 0.115) / max(0.2, -d.z);
            float r = length(s);
            float radius = 0.2 * (1.0 + uBass * 0.09 + uFlash * 0.05);
            float disc = smoothstep(radius, radius - 0.004, r);
            // Slats widen toward the bottom and drift downward.
            float band = (s.y + radius) / (2.0 * radius);
            float slat = step(0.5 - band * 0.62, fract(band * 9.0 - uTime * 0.12));
            float cut = mix(1.0, slat, smoothstep(0.62, 0.3, band));
            vec3 sunCol = mix(uColorA, vec3(1.0, 0.86, 0.32), smoothstep(0.15, 0.95, band));
            col = mix(col, sunCol * (0.6 + uBass * 0.25), disc * cut * uSun);
            col += sunCol * exp(-r * 6.5) * 0.2 * uSun * (0.8 + uBass * 0.7);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -5;
    this.group.add(this.sky, this.floor);
  }

  private pushRow(audio: ViewFrame["audio"]) {
    // Shift history one row toward the camera and write the newest spectrum
    // at the horizon (row 0).
    this.history.copyWithin(COLS, 0, COLS * (ROWS - 1));
    const bins = audio.bins;
    for (let c = 0; c < COLS; c++) {
      const byte = bins.length > 0 ? bins[logBin(c, COLS, bins.length)]! : 0;
      this.history[c] = Math.round(displayLevel(byte) * 255);
    }
    this.historyTex.needsUpdate = true;
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const amp = Math.max(0.05, opts.outrunAmplitude);
    const bass = normalizedBand(audio.bass);

    // Cruise speed follows the tempo once it is known, so the grid rolls in
    // time with the track instead of at an arbitrary rate.
    const tempo = f.bpmConfident && audio.bpm > 0 ? audio.bpm / 120 : 1;
    this.scroll += dt * opts.outrunSpeed * tempo * (14 + bass * 6);
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

    const palette = opts.outrunUsePalette ? f.palette : CLASSIC;
    for (const material of [this.floor.material, this.sky.material]) {
      material.uniforms.uColorA!.value.copy(palette[0]);
      material.uniforms.uColorB!.value.copy(palette[1]);
      material.uniforms.uColorC!.value.copy(palette[2]);
      material.uniforms.uBass!.value = bass;
      material.uniforms.uFlash!.value = this.flash;
    }
    const floor = this.floor.material.uniforms;
    floor.uScroll!.value = this.scroll;
    floor.uAmp!.value = amp;
    const sky = this.sky.material.uniforms;
    sky.uTime!.value = time;
    sky.uSun!.value = opts.outrunSun ? 1 : 0;
    sky.uHigh!.value = audio.high;

    if (f.xrMode) return;
    const sway = f.drift * 1.6;
    const targetX =
      Math.sin(time * 0.21) * sway + (opts.cameraMouse ? Math.sin(f.mouseYaw) * 5 : 0);
    const targetY =
      2.1 +
      Math.sin(time * 0.33) * 0.25 * (0.4 + f.drift) +
      (opts.cameraMouse ? Math.max(0, f.mousePitch) * 5 : 0) +
      f.kick * 0.6;
    const follow = Math.min(1, dt * 5);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.position.z += (10 - camera.position.z) * follow;
    camera.fov += (72 + f.kick * 7 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    this.sky.position.copy(camera.position);
    this.look.set(camera.position.x * 0.6, 2.6, -60);
    camera.lookAt(this.look);
  }

  dispose(): void {
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.sky.geometry.dispose();
    this.sky.material.dispose();
    this.historyTex.dispose();
  }
}
