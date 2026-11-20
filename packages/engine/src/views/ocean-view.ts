import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { meterLevel, logBin, type LazyView, type ViewFrame } from "./types";

const COLS = 64;
const ROWS = 96;
const SEA = 260;
/** Dusk triad used when "Use palette" is off. */
const DUSK = [new THREE.Color("#ff6a3d"), new THREE.Color("#5b2a86"), new THREE.Color("#2ad4c8")];

/**
 * The sky, shared by the dome and by the water's reflection so the sea
 * mirrors exactly what is above it — including the sun, whose reflection is
 * the glitter path.
 */
const SKY_GLSL = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform vec3 uColorC;
  uniform float uSunGlow;
  const vec3 SUN_DIR = vec3(0.0, 0.105, -0.9945);
  vec3 skyColor(vec3 d) {
    float h = max(d.y, 0.0);
    vec3 col = mix(uColorA * 0.55, uColorB * 0.6, smoothstep(0.0, 0.26, h));
    col = mix(col, uColorB * 0.12 + vec3(0.0, 0.0, 0.03), smoothstep(0.25, 0.85, h));
    // Thin cloud bands low in the sky, lit from beneath.
    float bands = smoothstep(0.55, 1.0, sin(h * 78.0 + sin(d.x * 3.0) * 1.6) * 0.5 + 0.5);
    col += uColorA * bands * 0.16 * smoothstep(0.3, 0.03, h);
    float s = max(dot(normalize(d), SUN_DIR), 0.0);
    col += mix(uColorA, vec3(1.0, 0.9, 0.7), 0.6) * pow(s, 90.0) * uSunGlow * 0.9;
    col += uColorA * pow(s, 9.0) * 0.16 * uSunGlow;
    return col;
  }
`;

/**
 * A stylised sea at dusk. Swell, waves and chop are the bass, mids and highs;
 * ripples of the last few seconds of spectrum travel in from the horizon; and
 * the sun's glitter path down the water brightens with the kick.
 *
 * The surface is displaced in the vertex shader and shaded analytically, with
 * the reflection sampled from the same sky function the dome uses.
 */
export class OceanView implements LazyView {
  readonly group = new THREE.Group();
  private readonly history = new Uint8Array(COLS * ROWS);
  private readonly historyTex: THREE.DataTexture;
  private readonly sea: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private scroll = 0;
  private travel = 0;
  private flash = 0;
  private lastPhase = 0;
  private readonly bands = { bass: 0, mid: 0, high: 0 };

  constructor() {
    this.historyTex = new THREE.DataTexture(this.history, COLS, ROWS, THREE.RedFormat);
    this.historyTex.magFilter = THREE.LinearFilter;
    this.historyTex.minFilter = THREE.LinearFilter;
    this.historyTex.needsUpdate = true;

    const colors = () => ({
      uColorA: { value: new THREE.Color() },
      uColorB: { value: new THREE.Color() },
      uColorC: { value: new THREE.Color() },
      uSunGlow: { value: 1 },
    });

    const geo = new THREE.PlaneGeometry(SEA, SEA, 220, 220);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -SEA / 2 + 14);
    this.sea = new THREE.Mesh(
      geo,
      new THREE.ShaderMaterial({
        uniforms: {
          ...colors(),
          tHistory: { value: this.historyTex },
          uTravel: { value: 0 },
          uScroll: { value: 0 },
          uSwell: { value: 0 },
          uWave: { value: 0 },
          uChop: { value: 0 },
          uAmp: { value: 1 },
          uFlash: { value: 0 },
        },
        vertexShader: /* glsl */ `
          uniform sampler2D tHistory;
          uniform float uTravel;
          uniform float uScroll;
          uniform float uSwell;
          uniform float uWave;
          uniform float uChop;
          uniform float uAmp;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          varying float vRipple;
          varying float vDist;
          // Height and slope of one travelling sine; the slope builds the normal.
          void wave(vec2 p, vec2 dir, float len, float amp, float speed, inout float h, inout vec2 slope) {
            float k = 6.28318 / len;
            float phase = dot(dir, p) * k + uTravel * speed;
            h += sin(phase) * amp;
            slope += dir * (cos(phase) * amp * k);
          }
          void main() {
            vec3 p = position;
            vec2 xz = p.xz;
            float h = 0.0;
            vec2 slope = vec2(0.0);
            // Bass: long swell. Mids: waves. Highs: short chop.
            wave(xz, normalize(vec2(0.12, 1.0)), 46.0, (0.35 + uSwell * 1.5) * uAmp, 1.0, h, slope);
            wave(xz, normalize(vec2(-0.5, 1.0)), 27.0, (0.2 + uSwell * 0.8) * uAmp, 1.3, h, slope);
            wave(xz, normalize(vec2(0.7, 0.8)), 11.0, (0.07 + uWave * 0.5) * uAmp, 1.9, h, slope);
            wave(xz, normalize(vec2(-0.85, 0.6)), 6.3, (0.04 + uWave * 0.3) * uAmp, 2.4, h, slope);
            wave(xz, normalize(vec2(0.3, -1.0)), 2.7, (0.012 + uChop * 0.12) * uAmp, 3.4, h, slope);
            wave(xz, normalize(vec2(-0.95, -0.3)), 1.6, (0.008 + uChop * 0.08) * uAmp, 4.3, h, slope);
            // Spectrum history rolling in from the horizon as ripples.
            float depth = clamp((14.0 - p.z) / ${SEA.toFixed(1)}, 0.0, 1.0);
            float u = clamp(abs(p.x) / ${(SEA / 2).toFixed(1)}, 0.0, 1.0);
            float row = 1.0 - depth - uScroll / ${ROWS.toFixed(1)};
            float level = texture2D(tHistory, vec2(u, clamp(row, 0.0, 1.0))).r;
            float ripple = level * (0.25 + depth * 1.3) * uAmp;
            h += ripple;
            vRipple = level;
            p.y += h;
            vDist = depth;
            vNormalW = normalize(vec3(-slope.x, 1.0, -slope.y));
            vec4 world = modelMatrix * vec4(p, 1.0);
            vWorld = world.xyz;
            gl_Position = projectionMatrix * viewMatrix * world;
          }
        `,
        fragmentShader: /* glsl */ `
          ${SKY_GLSL}
          uniform float uFlash;
          uniform float uChop;
          varying vec3 vWorld;
          varying vec3 vNormalW;
          varying float vRipple;
          varying float vDist;
          void main() {
            vec3 view = normalize(vWorld - cameraPosition);
            // Break the vertex normal up with fine detail from screen derivatives.
            vec3 n = normalize(vNormalW + vec3(dFdx(vWorld.y), 0.0, dFdy(vWorld.y)) * (0.6 + uChop * 2.0));
            vec3 r = reflect(view, n);
            r.y = abs(r.y);
            float fresnel = 0.04 + 0.96 * pow(1.0 - max(dot(-view, n), 0.0), 4.0);
            vec3 deep = uColorB * 0.05 + uColorC * 0.09;
            vec3 col = mix(deep, skyColor(r), fresnel);
            // Glitter: only wave faces tilted just right return the sun.
            float sun = pow(max(dot(normalize(r), SUN_DIR), 0.0), 220.0);
            col += mix(uColorA, vec3(1.0, 0.92, 0.75), 0.7) * sun * (1.6 + uFlash * 2.2) * uSunGlow;
            // Crests catch the light where the spectrum is loud.
            col += uColorC * smoothstep(0.35, 1.0, vRipple) * 0.3 * (1.0 - vDist * 0.6);
            // The horizon dissolves into the sky rather than ending in a line.
            col = mix(col, skyColor(vec3(view.x, 0.01, view.z)), smoothstep(0.55, 1.0, vDist));
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.sea.frustumCulled = false;

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(190, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        uniforms: { ...colors(), uTime: { value: 0 }, uHigh: { value: 0 }, uSun: { value: 1 } },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          ${SKY_GLSL}
          uniform float uTime;
          uniform float uHigh;
          uniform float uSun;
          varying vec3 vDir;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            vec3 d = normalize(vDir);
            vec3 col = skyColor(d);
            // Sun disc, half set, banded like a print.
            vec2 s = vec2(d.x, d.y - 0.105) / max(0.2, -d.z);
            float rr = length(s);
            float disc = smoothstep(0.17, 0.165, rr);
            float band = (s.y + 0.17) / 0.34;
            float slat = step(0.42 - band * 0.5, fract(band * 8.0 - uTime * 0.08));
            vec3 sunCol = mix(uColorA, vec3(1.0, 0.88, 0.45), smoothstep(0.1, 0.95, band));
            col = mix(col, sunCol * 0.62, disc * mix(1.0, slat, smoothstep(0.6, 0.25, band)) * uSun);
            vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0))) * 60.0;
            vec2 id = floor(sp);
            float star = step(0.99, hash(id));
            float tw = 0.5 + 0.5 * sin(uTime * (1.5 + hash(id + 3.0) * 4.0) + hash(id) * 40.0);
            float pt = smoothstep(0.42, 0.0, length(fract(sp) - 0.5));
            col += vec3(1.0) * star * pt * (0.25 + tw * (0.35 + uHigh * 1.3)) * smoothstep(0.3, 0.7, d.y);
            gl_FragColor = vec4(col, 1.0);
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -5;
    this.group.add(this.sky, this.sea);
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
    // Water has inertia: bands ease in so the sea swells rather than twitches.
    const ease = Math.min(1, dt * 2.5);
    this.bands.bass += (normalizedBand(audio.bass) - this.bands.bass) * ease;
    this.bands.mid += (normalizedBand(audio.mid) - this.bands.mid) * ease;
    this.bands.high += (normalizedBand(audio.high) - this.bands.high) * Math.min(1, dt * 5);

    const tempo = f.bpmConfident && audio.bpm > 0 ? audio.bpm / 120 : 1;
    this.travel += dt * opts.oceanSpeed * (0.8 + this.bands.mid * 0.8);
    this.scroll += dt * opts.oceanSpeed * tempo * 9;
    while (this.scroll >= 1) {
      this.scroll -= 1;
      this.pushRow(audio);
    }

    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 2.2);

    const palette = opts.oceanUsePalette ? f.palette : DUSK;
    const sun = opts.oceanSun ? 1 : 0;
    for (const material of [this.sea.material, this.sky.material]) {
      material.uniforms.uColorA!.value.copy(palette[0]);
      material.uniforms.uColorB!.value.copy(palette[1]);
      material.uniforms.uColorC!.value.copy(palette[2]);
      material.uniforms.uSunGlow!.value = sun * (0.85 + this.bands.bass * 0.5 + this.flash * 0.25);
    }
    const sea = this.sea.material.uniforms;
    sea.uTravel!.value = this.travel;
    sea.uScroll!.value = this.scroll;
    sea.uSwell!.value = this.bands.bass;
    sea.uWave!.value = this.bands.mid;
    sea.uChop!.value = this.bands.high;
    sea.uAmp!.value = Math.max(0.05, opts.oceanAmplitude);
    sea.uFlash!.value = this.flash;
    const sky = this.sky.material.uniforms;
    sky.uTime!.value = time;
    sky.uHigh!.value = audio.high;
    sky.uSun!.value = sun;

    if (f.xrMode) return;
    const sway = f.drift * 1.5;
    const targetX =
      Math.sin(time * 0.17) * sway + (opts.cameraMouse ? Math.sin(f.mouseYaw) * 6 : 0);
    const targetY =
      3.2 +
      Math.sin(time * 0.29) * 0.5 * (0.4 + f.drift) +
      this.bands.bass * 0.6 +
      (opts.cameraMouse ? Math.max(0, f.mousePitch) * 9 : 0) +
      f.kick * 0.5;
    const follow = Math.min(1, dt * 3);
    camera.position.x += (targetX - camera.position.x) * follow;
    camera.position.y += (targetY - camera.position.y) * follow;
    camera.position.z += (10 - camera.position.z) * follow;
    camera.fov += (62 + f.kick * 5 - camera.fov) * Math.min(1, dt * 10);
    camera.updateProjectionMatrix();
    this.sky.position.copy(camera.position);
    // Roll gently with the swell, as if on a boat.
    camera.lookAt(
      camera.position.x * 0.5,
      3.0 + Math.sin(time * 0.4) * 0.25 * this.bands.bass,
      -60,
    );
  }

  dispose(): void {
    for (const mesh of [this.sea, this.sky]) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this.historyTex.dispose();
  }
}
