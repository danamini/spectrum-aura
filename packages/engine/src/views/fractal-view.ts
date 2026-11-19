import * as THREE from "three";
import { normalizedBand } from "../loudness";
import { FULLSCREEN_VERTEX, type LazyView, type ViewFrame } from "./types";

const MAX_STEPS = 128;
const AURORA = [new THREE.Color("#ff5f6d"), new THREE.Color("#4b3cff"), new THREE.Color("#21f5c1")];

/**
 * A raymarched Mandelbulb that breathes with the music: bass bends the
 * fractal's power, mids drive the surface glow, and the beat flares the
 * orbit-trap colouring. Geometry here is pure mathematics — there is no mesh,
 * so the detail is limited only by the march budget.
 *
 * Cost is per pixel, so the march is bounded three ways: a bounding-sphere
 * test skips rays that miss, the step budget is a setting, and Performance
 * Mode halves it.
 */
export class FractalView implements LazyView {
  readonly group = new THREE.Group();
  private readonly quad: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private orbit = 0;
  private power = 8;
  private flash = 0;
  private phase = 0;
  private tumble = 0;
  private lastPhase = 0;

  constructor() {
    this.quad = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          uAspect: { value: 1 },
          uEye: { value: new THREE.Vector3(0, 0, 3) },
          uRight: { value: new THREE.Vector3(1, 0, 0) },
          uUp: { value: new THREE.Vector3(0, 1, 0) },
          uForward: { value: new THREE.Vector3(0, 0, -1) },
          uFocal: { value: 1.9 },
          uPower: { value: 8 },
          uSteps: { value: 64 },
          uTime: { value: 0 },
          uPhase: { value: 0 },
          uTumble: { value: 0 },
          uGlow: { value: 0 },
          uFlash: { value: 0 },
          uColorA: { value: new THREE.Color() },
          uColorB: { value: new THREE.Color() },
          uColorC: { value: new THREE.Color() },
        },
        vertexShader: FULLSCREEN_VERTEX,
        fragmentShader: /* glsl */ `
          uniform float uAspect;
          uniform vec3 uEye;
          uniform vec3 uRight;
          uniform vec3 uUp;
          uniform vec3 uForward;
          uniform float uFocal;
          uniform float uPower;
          uniform float uSteps;
          uniform float uTime;
          uniform float uPhase;
          uniform float uTumble;
          uniform float uGlow;
          uniform float uFlash;
          uniform vec3 uColorA;
          uniform vec3 uColorB;
          uniform vec3 uColorC;
          varying vec2 vUv;

          // Distance estimate; trap carries the orbit's closest approach to
          // the origin/axes for colouring.
          float bulb(vec3 p, out vec3 trap) {
            // Tumble the whole body so it turns on a second axis, not just
            // under the orbiting camera.
            float ct = cos(uTumble), st = sin(uTumble);
            p.yz = mat2(ct, -st, st, ct) * p.yz;
            vec3 z = p;
            float dr = 1.0;
            float r = 0.0;
            trap = vec3(1e3);
            for (int i = 0; i < 7; i++) {
              r = length(z);
              if (r > 2.2) break;
              // The phase offsets are advanced by the music, so the surface
              // churns with energy and holds still in silence.
              float theta = acos(clamp(z.y / r, -1.0, 1.0)) * uPower + uPhase;
              float phi = atan(z.z, z.x) * uPower + uPhase * 0.6;
              float zr = pow(r, uPower);
              dr = pow(r, uPower - 1.0) * uPower * dr + 1.0;
              z = zr * vec3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi)) + p;
              trap = min(trap, vec3(length(z), abs(z.y), length(z.xz)));
            }
            return 0.5 * log(max(r, 1e-6)) * r / dr;
          }

          void main() {
            vec2 p = (vUv - 0.5) * 2.0;
            p.x *= uAspect;
            vec3 rd = normalize(uForward * uFocal + uRight * p.x + uUp * p.y);
            vec3 bg = mix(uColorB * 0.04, uColorA * 0.05, vUv.y) * (1.0 + uFlash * 0.6);
            // Bounding sphere: most of the frame never enters the march loop.
            float b = dot(uEye, rd);
            float c = dot(uEye, uEye) - 1.69;
            float h = b * b - c;
            if (h < 0.0) {
              gl_FragColor = vec4(bg, 1.0);
              return;
            }
            float t = max(0.0, -b - sqrt(h));
            float tEnd = -b + sqrt(h);
            vec3 trap = vec3(0.0);
            float steps = 0.0;
            float hit = 0.0;
            float nearest = 1e3;
            for (int i = 0; i < ${MAX_STEPS}; i++) {
              if (float(i) >= uSteps || t > tEnd) break;
              float d = bulb(uEye + rd * t, trap);
              nearest = min(nearest, d);
              if (d < 0.0006 * (1.0 + t * 2.0)) { hit = 1.0; break; }
              t += d;
              steps += 1.0;
            }
            // Step count doubles as ambient occlusion: crevices cost more steps.
            float ao = 1.0 - steps / uSteps;
            vec3 col = bg;
            if (hit > 0.5) {
              vec3 pos = uEye + rd * t;
              // Tetrahedral normal: four extra estimates, paid only on a hit.
              vec3 scratch;
              vec2 e = vec2(1.0, -1.0) * 0.0012;
              vec3 n = normalize(
                e.xyy * bulb(pos + e.xyy, scratch) + e.yyx * bulb(pos + e.yyx, scratch) +
                e.yxy * bulb(pos + e.yxy, scratch) + e.xxx * bulb(pos + e.xxx, scratch));
              vec3 key = normalize(uRight * 0.55 + uUp * 0.75 - uForward * 0.5);
              float diffuse = max(dot(n, key), 0.0);
              float spec = pow(max(dot(reflect(-key, n), -rd), 0.0), 24.0);
              float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
              vec3 base = mix(uColorB, uColorA, clamp(trap.x * 0.9, 0.0, 1.0));
              base = mix(base, uColorC, clamp(1.0 - trap.z * 1.4, 0.0, 1.0));
              col = base * (0.26 + diffuse * 1.3) * ao * ao;
              col += uColorC * fres * (0.18 + uGlow * 0.55);
              col += vec3(1.0) * spec * 0.45 * ao;
              // Crevices glow from within on the beat.
              col += uColorA * pow(1.0 - ao, 2.5) * (0.12 + uFlash * 0.7 + uGlow * 0.35);
            }
            float rim = exp(-nearest * 30.0) * (1.0 - hit);
            vec3 outCol = col + mix(uColorA, uColorC, 0.5) * rim * (0.2 + uGlow * 0.5);
            gl_FragColor = vec4(outCol, 1.0);
          }
        `,
      }),
    );
    this.quad.frustumCulled = false;
    this.quad.renderOrder = -10;
    this.group.add(this.quad);
  }

  update(f: ViewFrame): void {
    const { dt, time, audio, opts, camera } = f;
    const u = this.quad.material.uniforms;
    const amp = Math.max(0.05, opts.fractalAmplitude);
    const bass = normalizedBand(audio.bass);

    const beatEdge = f.bpmConfident
      ? f.beatPhase < this.lastPhase && this.lastPhase > 0.5
      : audio.beat;
    this.lastPhase = f.beatPhase;
    if (beatEdge) this.flash = 1;
    this.flash = Math.max(0, this.flash - dt * 2.6);
    const mid = normalizedBand(audio.mid);
    const energy = (bass + mid + audio.high) / 3;
    // Music advances the surface phase and the tumble; silence slows both
    // to a drift.
    this.phase += dt * (0.12 + mid * 1.9 + bass * 1.1 + this.flash * 1.4) * amp;
    this.tumble += dt * (0.06 + energy * 0.55 + this.flash * 0.5);
    // Each beat snaps the power up and lets it ease back, on top of the bass
    // swing — fast enough to read as a hit, eased so it does not pop.
    const targetPower =
      opts.fractalPower +
      (bass - 0.25) * 3.6 * amp +
      this.flash * 1.3 * amp +
      Math.sin(time * 0.31) * 0.5;
    this.power += (targetPower - this.power) * Math.min(1, dt * 8);

    let yaw: number;
    let pitch: number;
    let dist: number;
    if (opts.cameraMouse) {
      yaw = f.mouseYaw;
      pitch = f.mousePitch;
      dist = 1.6 + f.mouseZoom * 0.11;
    } else {
      this.orbit += dt * (opts.orbitSpeed * 0.6 + 0.1 + energy * 0.45);
      yaw = this.orbit;
      pitch = 0.2 + Math.sin(time * 0.27) * 0.55 * (0.5 + f.drift * 0.5);
      // Slow dolly in and out, with a push toward the body on each beat.
      dist = 2.35 + Math.sin(time * 0.19) * 0.4 - this.flash * 0.28 - f.kick * 0.15;
    }
    const eye = u.uEye!.value as THREE.Vector3;
    eye.set(
      Math.sin(yaw) * Math.cos(pitch) * dist,
      Math.sin(pitch) * dist,
      Math.cos(yaw) * Math.cos(pitch) * dist,
    );
    const forward = (u.uForward!.value as THREE.Vector3).copy(eye).multiplyScalar(-1).normalize();
    const right = (u.uRight!.value as THREE.Vector3).set(-forward.z, 0, forward.x).normalize();
    (u.uUp!.value as THREE.Vector3).crossVectors(right, forward).normalize();

    const palette = opts.fractalUsePalette ? f.palette : AURORA;
    u.uColorA!.value.copy(palette[0]);
    u.uColorB!.value.copy(palette[1]);
    u.uColorC!.value.copy(palette[2]);
    u.uAspect!.value = camera.aspect || 1;
    u.uPower!.value = THREE.MathUtils.clamp(this.power, 2, 12);
    const budget = THREE.MathUtils.clamp(Math.round(opts.fractalDetail), 24, MAX_STEPS);
    u.uSteps!.value = opts.performance ? Math.max(24, Math.round(budget / 2)) : budget;
    u.uTime!.value = time;
    u.uPhase!.value = this.phase;
    u.uTumble!.value = this.tumble;
    u.uGlow!.value = mid * amp;
    u.uFlash!.value = this.flash;
  }

  dispose(): void {
    this.quad.geometry.dispose();
    this.quad.material.dispose();
  }
}
