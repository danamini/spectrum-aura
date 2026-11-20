import * as THREE from "three";
import type { AudioBands } from "../audio";

/** What sits behind a view's own geometry. */
export type BackdropKind = "none" | "space" | "horizon" | "data";
const KIND_INDEX: Record<BackdropKind, number> = { none: 0, space: 1, horizon: 2, data: 3 };

export type BackdropConfig = { kind: BackdropKind; floorY?: number };

/**
 * A world behind the older views, which otherwise float in a black void:
 * a starfield with drifting nebula ("space"), a lit grid floor running to a
 * glowing horizon ("horizon"), or a cylinder of falling data ("data").
 *
 * One full-screen triangle pair drawn before everything else. The fragment
 * shader rebuilds each pixel's view ray from the camera, so stars hold still
 * and the floor stays a real plane as the camera orbits — the backdrop is
 * part of the scene, not a wallpaper. It is kept dim on purpose: it frames
 * the subject and must not compete with it.
 */
export class Backdrop {
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private kind: BackdropKind = "none";
  private fade = 0;
  private beat = 1;

  constructor() {
    const material = new THREE.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uInvProj: { value: new THREE.Matrix4() },
        uCamWorld: { value: new THREE.Matrix4() },
        uCamPos: { value: new THREE.Vector3() },
        uKind: { value: 0 },
        uAmount: { value: 0 },
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uHigh: { value: 0 },
        uBeat: { value: 1 },
        uFloorY: { value: 0 },
        uBg: { value: new THREE.Color() },
        uA: { value: new THREE.Color() },
        uB: { value: new THREE.Color() },
        uC: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
        varying vec2 vNdc;
        void main() {
          vNdc = position.xy;
          gl_Position = vec4(position.xy, 1.0, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        varying vec2 vNdc;
        uniform mat4 uInvProj;
        uniform mat4 uCamWorld;
        uniform vec3 uCamPos;
        uniform float uKind, uAmount, uTime, uBass, uMid, uHigh, uBeat, uFloorY;
        uniform vec3 uBg, uA, uB, uC;
        const float TAU = 6.2831853;

        float hash13(vec3 p) {
          p = fract(p * 0.1031);
          p += dot(p, p.zyx + 31.32);
          return fract((p.x + p.y) * p.z);
        }
        float hash12(vec2 p) {
          vec3 q = fract(vec3(p.xyx) * 0.1031);
          q += dot(q, q.yzx + 33.33);
          return fract((q.x + q.y) * q.z);
        }
        float noise3(vec3 p) {
          vec3 i = floor(p);
          vec3 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x),
                mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
            mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x),
                mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
            f.z);
        }
        float fbm(vec3 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * noise3(p);
            p = p * 2.03 + 11.7;
            a *= 0.5;
          }
          return v;
        }
        // One star per cell of a grid laid over the direction sphere.
        float stars(vec3 d, float scale) {
          vec3 p = d * scale;
          vec3 cell = floor(p);
          float h = hash13(cell);
          vec3 offset = vec3(hash13(cell + 1.7), hash13(cell + 5.3), hash13(cell + 9.1)) - 0.5;
          float dist = length(fract(p) - 0.5 - offset * 0.6);
          float twinkle = 0.65 + 0.35 * sin(uTime * (1.0 + h * 3.0) + h * 40.0);
          return step(0.8, h) * smoothstep(0.1, 0.0, dist) * twinkle;
        }

        vec3 space(vec3 d) {
          float cloud = fbm(d * 1.7 + vec3(0.0, uTime * 0.012, 0.0));
          float wisp = fbm(d * 3.3 + vec3(uTime * 0.02, 0.0, 7.0));
          vec3 col = uB * 0.3 * smoothstep(0.34, 0.78, cloud);
          col += uA * 0.22 * smoothstep(0.44, 0.85, wisp) * (0.5 + uBass * 1.2);
          col += uC * 0.1 * smoothstep(0.5, 0.9, cloud * wisp * 2.2) * (0.6 + uMid);
          float s = stars(d, 55.0) * 1.3 + stars(d, 110.0) * 0.7 + stars(d, 200.0) * 0.35;
          col += mix(vec3(1.0), uC, 0.35) * s * (0.55 + uHigh * 0.9);
          return col;
        }

        vec3 horizon(vec3 d) {
          float h = d.y;
          vec3 col = uB * 0.07 * (1.0 - smoothstep(0.0, 0.55, h));
          // Glow along the horizon line, swelling with the bass.
          col += uA * exp(-abs(h) * 13.0) * (0.11 + uBass * 0.26);
          if (h > 0.0) col += (stars(d, 90.0) + stars(d, 170.0) * 0.4) * (0.35 + uHigh * 0.5);
          float t = (uFloorY - uCamPos.y) / min(h, -0.0005);
          if (h < -0.0005 && t > 0.0) {
            vec3 p = uCamPos + d * t;
            vec2 g = p.xz / 2.2;
            vec2 w = max(fwidth(g), vec2(0.0005));
            vec2 lines = smoothstep(w * 1.6, vec2(0.0), abs(fract(g - 0.5) - 0.5));
            float line = max(lines.x, lines.y);
            float fade = exp(-t * 0.03);
            float r = length(p.xz);
            // A ring of light running out across the floor on each beat.
            float ring = smoothstep(1.6, 0.0, abs(r - uBeat * 46.0)) * (1.0 - uBeat);
            vec3 floorCol = uC * line * (0.2 + uMid * 0.2);
            floorCol += uA * ring * 0.4;
            floorCol += uA * exp(-r * 0.07) * (0.03 + uBass * 0.1);
            col += floorCol * fade;
          }
          return col;
        }

        vec3 dataRain(vec3 d) {
          float around = atan(d.x, d.z) / TAU;
          float column = floor(around * 120.0);
          float speed = 0.35 + hash12(vec2(column, 3.0)) * 0.9;
          float y = d.y * 34.0 + uTime * speed * (1.0 + uMid * 0.8);
          vec2 cell = vec2(column, floor(y));
          vec2 inCell = vec2(fract(around * 120.0), fract(y));
          float glyph = step(0.42, hash12(cell)) *
            step(0.18, inCell.x) * step(inCell.x, 0.82) * step(0.22, inCell.y) * step(inCell.y, 0.78);
          // Each column carries bright heads with fading trails behind them.
          float trail = fract(y * 0.03 + hash12(vec2(column, 9.0)));
          float head = pow(trail, 7.0);
          float edge = 1.0 - smoothstep(0.55, 0.95, abs(d.y));
          vec3 col = uC * glyph * (0.035 + pow(trail, 2.5) * 0.12) * edge;
          col += mix(uA, vec3(1.0), 0.3) * glyph * head * (0.3 + uHigh * 0.5) * edge;
          col += uB * 0.05 * (1.0 - abs(d.y));
          return col;
        }

        void main() {
          vec4 view = uInvProj * vec4(vNdc, 1.0, 1.0);
          vec3 d = normalize((uCamWorld * vec4(view.xyz / view.w, 0.0)).xyz);
          vec3 col = vec3(0.0);
          if (uKind < 1.5) col = space(d);
          else if (uKind < 2.5) col = horizon(d);
          else col = dataRain(d);
          gl_FragColor = vec4(uBg + col * uAmount, 1.0);
        }
      `,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = -10000;
    this.mesh.visible = false;
    // Read the camera at draw time: views position it after the shared update.
    this.mesh.onBeforeRender = (_renderer, _scene, camera) => {
      const u = material.uniforms;
      (u.uInvProj!.value as THREE.Matrix4).copy(camera.projectionMatrixInverse);
      (u.uCamWorld!.value as THREE.Matrix4).copy(camera.matrixWorld);
      (u.uCamPos!.value as THREE.Vector3).setFromMatrixPosition(camera.matrixWorld);
    };
  }

  update(
    dt: number,
    time: number,
    audio: AudioBands,
    palette: readonly [THREE.Color, THREE.Color, THREE.Color],
    background: THREE.Color,
    config: BackdropConfig,
    amount: number,
    beat: { kick: number; phase: number; confident: boolean },
  ): void {
    const want = amount > 0.001 ? config.kind : "none";
    if (want !== this.kind) {
      // Fade the old world out before the new one fades in.
      this.fade = Math.max(0, this.fade - dt * 4);
      if (this.fade <= 0) this.kind = want;
    } else {
      this.fade = Math.min(1, this.fade + dt * 1.5);
    }
    if (this.kind === "none") {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    // Ring position: the beat phase when tempo is known, else time since a kick.
    if (beat.confident) this.beat = beat.phase;
    else this.beat = beat.kick > 0.95 ? 0 : Math.min(1, this.beat + dt * 1.6);
    const u = this.mesh.material.uniforms;
    u.uKind!.value = KIND_INDEX[this.kind];
    u.uAmount!.value = amount * this.fade;
    u.uTime!.value = time;
    u.uBass!.value = Math.max(0, Math.min(1, audio.bass));
    u.uMid!.value = Math.max(0, Math.min(1, audio.mid));
    u.uHigh!.value = Math.max(0, Math.min(1, audio.high));
    u.uBeat!.value = this.beat;
    u.uFloorY!.value = config.floorY ?? 0;
    (u.uBg!.value as THREE.Color).copy(background);
    (u.uA!.value as THREE.Color).copy(palette[0]);
    (u.uB!.value as THREE.Color).copy(palette[1]);
    (u.uC!.value as THREE.Color).copy(palette[2]);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
  }
}

/** Which world sits behind each original view. Views not listed get none. */
export const VIEW_BACKDROPS: Readonly<Record<string, BackdropConfig>> = {
  combo: { kind: "space" },
  classic: { kind: "horizon", floorY: 0 },
  ripple: { kind: "space" },
  datastream: { kind: "data" },
  nebula: { kind: "space" },
  monolith: { kind: "horizon", floorY: 0 },
  mandala: { kind: "space" },
  terrain: { kind: "space" },
  obsidian: { kind: "space" },
  torus: { kind: "space" },
  soundwall: { kind: "horizon", floorY: 0 },
  geometrynebula: { kind: "space" },
  reztube: { kind: "data" },
  assetflow: { kind: "space" },
  wikichroma: { kind: "space" },
  stagelights: { kind: "horizon", floorY: -3.4 },
};
export const NO_BACKDROP: BackdropConfig = { kind: "none" };
