import type * as THREE from "three";
import type { AudioBands } from "../audio";
import type { SceneUpdateOpts } from "../scene-update-opts";

/** Per-frame context handed to a lazily built view. One pooled object is
 * mutated every frame — views must not retain it. */
export type ViewFrame = {
  dt: number;
  time: number;
  audio: AudioBands;
  opts: SceneUpdateOpts;
  camera: THREE.PerspectiveCamera;
  palette: readonly [THREE.Color, THREE.Color, THREE.Color];
  /** Decaying beat envelope (0–1), already scaled by the camera-beat amount. */
  kick: number;
  /** SongClock beat phase when tempo is confident, else 0. */
  beatPhase: number;
  bpmConfident: boolean;
  xrMode: boolean;
  mouseYaw: number;
  mousePitch: number;
  mouseZoom: number;
  /** Camera drift amount (0 when drift is off). */
  drift: number;
};

/**
 * A view that is built on first activation and released after it has been
 * off-screen for a while, so its geometry, textures and network data cost
 * nothing until the view is actually shown.
 */
export interface LazyView {
  readonly group: THREE.Group;
  update(frame: ViewFrame): void;
  resize?(width: number, height: number): void;
  dispose(): void;
}

/** Clip-space quad: covers the viewport regardless of the scene camera. */
export const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 1.0, 1.0);
  }
`;

/**
 * Spectrum byte → 0–1 display level with square-root compression. Quiet
 * material (and the ambient source) sits around 10–15% of full scale; the
 * knee lifts that into view without clipping loud passages.
 */
export function displayLevel(byte: number): number {
  return Math.sqrt(Math.max(0, byte) / 255);
}

/**
 * Level for anything that reads as a meter: empty at the noise floor, full at
 * the top of the scale. Bins are decibel-scaled, so a quiet room already reads
 * 30–40%; `displayLevel` lifts that to 60% or more, which fills a meter with
 * nothing playing. Use this where "quiet" must look quiet.
 */
const METER_FLOOR = 0.4;
const METER_SPAN = 0.45;
/** `span` is how much of the scale fills the meter; widen it for instruments
 * that must show headroom rather than sit at the top on loud material. */
export function meterLevel(byte: number, span = METER_SPAN): number {
  const t = (byte / 255 - METER_FLOOR) / span;
  return t <= 0 ? 0 : t >= 1 ? 1 : t;
}

/** Maps display column `i` of `count` onto a log-spaced FFT bin, so octaves
 * get equal width instead of the top octave taking half the columns. */
export function logBin(i: number, count: number, binCount: number): number {
  if (binCount <= 1) return 0;
  const lo = 2;
  const hi = Math.max(lo + 1, binCount * 0.72);
  const t = count <= 1 ? 0 : i / (count - 1);
  return Math.min(binCount - 1, Math.floor(lo * Math.pow(hi / lo, t)));
}
