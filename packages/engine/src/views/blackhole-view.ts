import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { FULLSCREEN_VERTEX, displayLevel, logBin, type LazyView, type ViewFrame } from "./types";

const FREQS = 128;
const ROWS = 256;
const ROWS_PER_SECOND = 44;
const MAX_STEPS = 120;
/** Hot-plasma triad used when "Use palette" is off. */
const EMBER = [new THREE.Color("#ffd9a0"), new THREE.Color("#ff7a1a"), new THREE.Color("#b3200a")];

/**
 * A black hole whose accretion disk is the music. Light rays are bent through
 * a Schwarzschild field per pixel, so the far side of the disk arches over
 * and under the shadow and the starfield smears around it. The disk itself is
 * a live spectrogram: bass at the hot inner edge, treble at the rim, each
 * slice of audio entering at one angle and spiralling round as it ages.
 *
 * Like the Spectro-Tunnel this is one clip-space quad and a small history
 * texture; the cost is the per-pixel ray integration, bounded by the Detail
 * setting and halved in Performance Mode.
 */
export class BlackHoleView implements LazyView {
  readonly group = new THREE.Group();
  private readonly history = new Uint8Array(FREQS * ROWS);
  private readonly texture: THREE.DataTexture;
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private head = 0;
  private rowDebt = 0;
  private orbit = 0;
  private flash = 0;
  private lastPhase = 0;

  constructor() {
    this.texture = new THREE.DataTexture(this.history, FREQS, ROWS, THREE.RedFormat);
    this.texture.magFilter = THREE.LinearFilter;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.wrapS = THREE.ClampToEdgeWrapping;
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
          uEye: { value: new THREE.Vector3(0, 2, 14) },
          uRight: { value: new THREE.Vector3(1, 0, 0) },
          uUp: { value: new THREE.Vector3(0, 1, 0) },
          uForward: { value: new THREE.Vector3(0, 0, -1) },
          uFocal: { value: 1.7 },
          uSteps: { value: 96 },
          uTime: { value: 0 },
          uAmp: { value: 1 },
          uFlash: { value: 0 },
          uBass: { value: 0 },
          uHigh: { value: 0 },
          uColorA: { value: new THREE.Color() },
          uColorB: { value: new THREE.Color() },
          uColorC: { value: new THREE.Color() },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform sampler2D tSpectrum;
          uniform float uHead;
          uniform float uAspect;
          uniform vec3 uEye;
          uniform vec3 uRight;
          uniform vec3 uUp;
          uniform vec3 uForward;
          uniform float uFocal;
          uniform float uSteps;
          uniform float uTime;
          uniform float uAmp;
          uniform float uFlash;
          uniform float uBass;
          uniform float uHigh;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          varying vec2 vUv;
          const float TAU = 6.28318530718;
          // Lengths are in Schwarzschild radii: the horizon is r = 1.
          const float R_IN = 2.4;
          const float R_OUT = 9.0;

          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

          vec3 stars(vec3 d) {
            vec2 sp = vec2(atan(d.x, -d.z), asin(clamp(d.y, -1.0, 1.0))) * 46.0;
            vec2 id = floor(sp);
            float star = step(0.975, hash(id));
            float tw = 0.5 + 0.5 * sin(uTime * (1.2 + hash(id + 3.0) * 4.0) + hash(id) * 40.0);
            float pt = smoothstep(0.4, 0.0, length(fract(sp) - 0.5));
            vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash(id + 9.0));
            vec3 haze = mix(uColorC, uColorB, 0.5 + 0.5 * d.y) * 0.035;
            return haze + tint * star * pt * (0.35 + tw * (0.45 + uHigh * 1.4));
          }

          // Disk emission where a ray crosses the equatorial plane at 'hit'.
          vec4 disk(vec3 hit, vec3 rayDir) {
            float r = length(hit.xz);
            float f = (r - R_IN) / (R_OUT - R_IN);
            if (f <= 0.0 || f >= 1.0) return vec4(0.0);
            // Log-spiral shear: each audio slice enters along one arm and is
            // carried round as newer slices arrive behind it.
            float turn = fract(atan(hit.z, hit.x) / TAU + 0.5 * log(r));
            float level = texture2D(tSpectrum, vec2(f, uHead - (0.5 + turn * ${(ROWS - 2).toFixed(1)}) / ${ROWS.toFixed(1)})).r;
            // Hide the join between the newest and oldest slice.
            float seam = smoothstep(0.0, 0.05, turn) * smoothstep(1.0, 0.82, turn);
            level *= seam * uAmp;
            // Fine orbital streaks so the disk has structure even in silence.
            float streak = 0.75 + 0.25 * sin(r * 9.0 + sin(turn * TAU * 3.0) * 2.0);
            float falloff = pow(1.0 - f, 1.6);
            float glow = (0.1 + uBass * 0.25) * falloff * streak + level * level * (0.35 + falloff * 1.5);
            // Relativistic beaming: the side rotating toward the viewer is brighter.
            vec3 flow = normalize(vec3(-hit.z, 0.0, hit.x));
            float beam = pow(clamp(1.0 + 0.55 * dot(flow, -rayDir), 0.3, 1.5), 1.5);
            float heat = clamp(falloff * 0.85 + level * 0.45, 0.0, 1.0);
            vec3 col = mix(uColorC, uColorB, smoothstep(0.0, 0.45, heat));
            col = mix(col, uColorA, smoothstep(0.4, 0.8, heat));
            col = mix(col, vec3(1.0), smoothstep(0.8, 1.0, heat) * 0.7);
            float edge = smoothstep(0.0, 0.06, f) * smoothstep(1.0, 0.7, f);
            float bright = glow * beam * edge * (1.0 + uFlash * 0.6);
            return vec4(col * bright * 0.62, clamp(bright * 1.3, 0.0, 0.94));
          }

          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            p.x *= uAspect;
            vec3 pos = uEye;
            vec3 vel = normalize(uForward * uFocal + uRight * p.x + uUp * p.y);
            // Conserved angular momentum sets how hard this ray is bent.
            vec3 L = cross(pos, vel);
            float h2 = dot(L, L);
            vec3 col = vec3(0.0);
            float through = 1.0;
            float nearest = 1e3;
            bool captured = false;
            float stepScale = 0.062 * (96.0 / uSteps);
            for (int i = 0; i < ${MAX_STEPS}; i++) {
              if (float(i) >= uSteps) break;
              float r2 = dot(pos, pos);
              float r = sqrt(r2);
              nearest = min(nearest, r);
              if (r < 1.0) { captured = true; break; }
              if (r > 30.0 && dot(pos, vel) > 0.0) break;
              float dt = clamp(r * stepScale, 0.03, 1.2);
              vel += (-1.5 * h2 * pos / (r2 * r2 * r)) * dt;
              vec3 next = pos + vel * dt;
              if (pos.y * next.y < 0.0) {
                vec3 hit = mix(pos, next, pos.y / (pos.y - next.y));
                vec4 d = disk(hit, normalize(vel));
                col += through * d.rgb;
                through *= 1.0 - d.a;
              }
              pos = next;
            }
            if (!captured) {
              col += through * stars(normalize(vel));
              // Photon ring: rays that grazed the unstable orbit at r = 1.5.
              float ring = exp(-abs(nearest - 1.5) * 7.0);
              col += through * mix(uColorA, vec3(1.0), 0.5) * ring * (0.1 + uFlash * 0.55 + uBass * 0.2);
            }
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

    // Slice rate sets how fast the disk turns: one revolution per ROWS slices.
    const spin = Math.max(0.05, opts.blackholeSpin);
    this.rowDebt = Math.min(8, this.rowDebt + dt * ROWS_PER_SECOND * spin * (0.7 + bass * 0.6));
    let wrote = false;
    while (this.rowDebt >= 1) {
      this.rowDebt -= 1;
      this.writeRow(audio);
      wrote = true;
    }
    if (wrote) this.texture.needsUpdate = true;

    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 2.4);

    let yaw: number;
    let pitch: number;
    let dist: number;
    const tilt = THREE.MathUtils.degToRad(THREE.MathUtils.clamp(opts.blackholeTilt, 1, 60));
    if (opts.cameraMouse) {
      yaw = f.mouseYaw;
      pitch = THREE.MathUtils.clamp(f.mousePitch, -1.3, 1.3);
      dist = 6 + f.mouseZoom * 0.75;
    } else {
      this.orbit += dt * (opts.orbitSpeed * 0.35 + 0.03);
      yaw = this.orbit;
      // Rock gently through the disk plane's neighbourhood so the lensed
      // arcs above and below the shadow keep changing.
      pitch = tilt + Math.sin(time * 0.13) * 0.09 * (0.5 + f.drift);
      dist = 11.5 + Math.sin(time * 0.09) * 1.2 * (0.4 + f.drift) - f.kick * 0.6;
    }
    const eye = (u.uEye!.value as THREE.Vector3).set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    const forward = (u.uForward!.value as THREE.Vector3).copy(eye).multiplyScalar(-1).normalize();
    const right = (u.uRight!.value as THREE.Vector3).set(-forward.z, 0, forward.x).normalize();
    (u.uUp!.value as THREE.Vector3).crossVectors(right, forward).normalize();

    const palette = opts.blackholeUsePalette ? f.palette : EMBER;
    u.uColorA!.value.copy(palette[0]);
    u.uColorB!.value.copy(palette[1]);
    u.uColorC!.value.copy(palette[2]);
    u.uHead!.value = (this.head + this.rowDebt) / ROWS;
    u.uAspect!.value = camera.aspect || 1;
    u.uFocal!.value = 2.25 - this.flash * 0.1;
    const budget = THREE.MathUtils.clamp(Math.round(opts.blackholeDetail), 40, MAX_STEPS);
    u.uSteps!.value = opts.performance ? Math.max(40, Math.round(budget * 0.6)) : budget;
    u.uTime!.value = time;
    u.uAmp!.value = Math.max(0.05, opts.blackholeAmplitude);
    u.uFlash!.value = this.flash;
    u.uBass!.value = bass;
    u.uHigh!.value = audio.high;
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.quad.material.dispose();
    this.texture.dispose();
  }
}
