import type { AudioBands } from "./audio";

/**
 * Dynamic contrast for the presentation spectrum.
 *
 * Mastered music keeps most of the spectrum loud all the time: on a decibel
 * scale the bins sit at 60–90% and move by a few percent, so a view that maps
 * level to size is pinned near its maximum and barely moves. This stage shows
 * each bin relative to its own recent range — the floor it rests on and the
 * peak it reaches — so a kick reads as a full-height hit whether the track is
 * quiet or loud, and a sustained pad stops holding everything up.
 *
 * `amount` blends between the raw level (0) and the fully contrasted one (1).
 * Presentation only: it writes its own buffer and never touches the bands
 * that tempo and onset detection read.
 */
const FLOOR_FALL_PER_SECOND = 6;
const FLOOR_RISE_PER_SECOND = 0.35;
const PEAK_DECAY_PER_SECOND = 0.28;
/** Smallest range treated as signal, so silence and hiss are not stretched. */
const MIN_RANGE_BYTES = 30;
const MIN_RANGE_BAND = 0.08;
/**
 * Contrast fades in with absolute loudness. Room noise jitters by more than
 * the minimum range, so without this a near-silent input is stretched to
 * full height. Below QUIET the raw level passes through; at LOUD and above
 * contrast applies in full.
 */
const QUIET_BYTES = 90;
const LOUD_BYTES = 170;

function loudnessGate(peak: number, quiet: number, loud: number): number {
  const t = (peak - quiet) / (loud - quiet);
  return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
}

export class SpectrumContrast {
  private floor = new Float32Array(0);
  private peak = new Float32Array(0);
  private out = new Uint8Array(0);
  private readonly bandFloor = [0, 0, 0];
  private readonly bandPeak = [0, 0, 0];

  reset(): void {
    this.floor.fill(0);
    this.peak.fill(0);
    this.bandFloor.fill(0);
    this.bandPeak.fill(0);
  }

  private band(index: number, value: number, dt: number, amount: number): number {
    const floor = this.bandFloor[index]!;
    const peak = this.bandPeak[index]!;
    const nextFloor =
      floor +
      (value - floor) *
        Math.min(1, dt * (value < floor ? FLOOR_FALL_PER_SECOND : FLOOR_RISE_PER_SECOND));
    const nextPeak =
      value > peak ? value : peak - (peak - value) * Math.min(1, dt * PEAK_DECAY_PER_SECOND);
    this.bandFloor[index] = nextFloor;
    this.bandPeak[index] = nextPeak;
    const range = Math.max(MIN_RANGE_BAND, nextPeak - nextFloor);
    const contrasted = Math.max(0, Math.min(1, (value - nextFloor) / range));
    const gate = loudnessGate(nextPeak, QUIET_BYTES / 255, LOUD_BYTES / 255);
    return value + (contrasted - value) * amount * gate;
  }

  /** Rewrites `target`'s bins and band levels in place of the ones it holds. */
  apply(target: AudioBands, dt: number, amount: number): void {
    const a = amount < 0 ? 0 : amount > 1 ? 1 : amount;
    const source = target.bins;
    const n = source.length;
    if (this.floor.length !== n) {
      this.floor = new Float32Array(n);
      this.peak = new Float32Array(n);
      this.out = new Uint8Array(n);
    }
    if (a <= 0 || n === 0) return;
    const step = Math.max(0, Math.min(0.1, dt));
    const fall = Math.min(1, step * FLOOR_FALL_PER_SECOND);
    const rise = Math.min(1, step * FLOOR_RISE_PER_SECOND);
    const decay = Math.min(1, step * PEAK_DECAY_PER_SECOND);
    const floor = this.floor;
    const peak = this.peak;
    const out = this.out;
    for (let i = 0; i < n; i++) {
      const v = source[i]!;
      const f = floor[i]! + (v - floor[i]!) * (v < floor[i]! ? fall : rise);
      const p = v > peak[i]! ? v : peak[i]! - (peak[i]! - v) * decay;
      floor[i] = f;
      peak[i] = p;
      const range = p - f > MIN_RANGE_BYTES ? p - f : MIN_RANGE_BYTES;
      let c = ((v - f) / range) * 255;
      if (c < 0) c = 0;
      else if (c > 255) c = 255;
      out[i] = v + (c - v) * a * loudnessGate(p, QUIET_BYTES, LOUD_BYTES) + 0.5;
    }
    target.bins = out;
    target.bass = this.band(0, target.bass, step, a);
    target.mid = this.band(1, target.mid, step, a);
    target.high = this.band(2, target.high, step, a);
  }
}
