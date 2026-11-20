/**
 * Pure helpers for the instrument-style views (Hi-Fi, Signal Lab): number
 * formatting, pitch naming, peak picking, needle ballistics and the
 * seven-segment digit table. No DOM or three.js, so they are unit-testable.
 */

/** Speed of sound in air at 20 °C, metres per second. */
export const SPEED_OF_SOUND = 343;

export function formatHz(hz: number): string {
  if (!(hz > 0)) return "--";
  if (hz < 1000) return `${Math.round(hz)} Hz`;
  return `${(hz / 1000).toFixed(hz < 10000 ? 2 : 1)} kHz`;
}

/** Wavelength in air, in the unit a person would use for that size. */
export function formatWavelength(hz: number): string {
  if (!(hz > 0)) return "--";
  const metres = SPEED_OF_SOUND / hz;
  if (metres >= 1) return `${metres.toFixed(2)} m`;
  if (metres >= 0.01) return `${(metres * 100).toFixed(1)} cm`;
  return `${(metres * 1000).toFixed(1)} mm`;
}

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

/** Nearest equal-tempered note (A4 = 440 Hz) and the offset from it in cents. */
export function nearestNote(hz: number): { name: string; cents: number } | null {
  if (!(hz > 0)) return null;
  const midi = 69 + 12 * Math.log2(hz / 440);
  const nearest = Math.round(midi);
  if (nearest < 0 || nearest > 135) return null;
  return {
    name: `${NOTE_NAMES[nearest % 12]}${Math.floor(nearest / 12) - 1}`,
    cents: Math.round((midi - nearest) * 100),
  };
}

/**
 * Indices of the strongest local maxima in `levels`, strongest first. A peak
 * must exceed `minLevel` and sit at least `minSeparation` samples from any
 * stronger peak already chosen. Writes into `out` and returns the count.
 */
export function findPeaks(
  levels: ArrayLike<number>,
  out: number[],
  maxPeaks: number,
  minSeparation: number,
  minLevel: number,
): number {
  let count = 0;
  const n = levels.length;
  for (let pick = 0; pick < maxPeaks; pick++) {
    let best = -1;
    let bestLevel = minLevel;
    for (let i = 1; i < n - 1; i++) {
      const v = levels[i]!;
      if (v <= bestLevel || v < levels[i - 1]! || v < levels[i + 1]!) continue;
      let clear = true;
      for (let k = 0; k < count; k++) {
        if (Math.abs(out[k]! - i) < minSeparation) {
          clear = false;
          break;
        }
      }
      if (clear) {
        best = i;
        bestLevel = v;
      }
    }
    if (best < 0) break;
    out[count++] = best;
  }
  return count;
}

/**
 * A moving-coil needle: a damped spring chasing its target, so it swings up
 * with a little overshoot and falls back with weight instead of teleporting.
 */
export class NeedleBallistics {
  position = 0;
  private velocity = 0;
  constructor(
    private readonly stiffness = 170,
    private readonly damping = 19,
  ) {}

  step(target: number, dt: number): number {
    // Sub-step so a dropped frame cannot make the spring explode.
    let remaining = Math.max(0, Math.min(0.1, dt));
    while (remaining > 0) {
      const h = Math.min(remaining, 1 / 120);
      this.velocity +=
        ((target - this.position) * this.stiffness - this.velocity * this.damping) * h;
      this.position += this.velocity * h;
      remaining -= h;
    }
    // The needle rests against its end stops.
    if (this.position < -0.04) {
      this.position = -0.04;
      this.velocity = 0;
    } else if (this.position > 1.04) {
      this.position = 1.04;
      this.velocity = 0;
    }
    return this.position;
  }
}

/** VU scale marks and where each sits across the dial (0 = left stop, 1 = right). */
export const VU_SCALE: ReadonlyArray<readonly [db: number, at: number]> = [
  [-20, 0],
  [-10, 0.18],
  [-7, 0.29],
  [-5, 0.38],
  [-3, 0.49],
  [-2, 0.555],
  [-1, 0.625],
  [0, 0.7],
  [1, 0.79],
  [2, 0.89],
  [3, 1],
];

/** Dial position (0–1) for a level in VU decibels, following the real scale's spacing. */
export function vuPosition(db: number): number {
  if (db <= VU_SCALE[0]![0]) return 0;
  for (let i = 1; i < VU_SCALE.length; i++) {
    const [d1, p1] = VU_SCALE[i]!;
    if (db <= d1) {
      const [d0, p0] = VU_SCALE[i - 1]!;
      return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
    }
  }
  return 1;
}

/**
 * Seven-segment patterns, one bit per segment:
 * 1 top, 2 top-right, 4 bottom-right, 8 bottom, 16 bottom-left, 32 top-left, 64 middle.
 */
export const SEVEN_SEGMENT: Readonly<Record<string, number>> = {
  "0": 0b0111111,
  "1": 0b0000110,
  "2": 0b1011011,
  "3": 0b1001111,
  "4": 0b1100110,
  "5": 0b1101101,
  "6": 0b1111101,
  "7": 0b0000111,
  "8": 0b1111111,
  "9": 0b1101111,
  "-": 0b1000000,
  " ": 0,
};

/** RMS and peak of a time-domain byte frame (128 = zero), both in dBFS. */
export function waveLevels(wave: ArrayLike<number>, out: { rmsDb: number; peakDb: number }): void {
  const n = wave.length;
  if (n === 0) {
    out.rmsDb = -Infinity;
    out.peakDb = -Infinity;
    return;
  }
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < n; i++) {
    const v = (wave[i]! - 128) / 128;
    sum += v * v;
    const a = v < 0 ? -v : v;
    if (a > peak) peak = a;
  }
  const rms = Math.sqrt(sum / n);
  out.rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;
  out.peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

/**
 * Strongest spectrum byte within a third of an octave either side of `hz`.
 * `binHz` is the width of one FFT bin.
 */
export function bandPeak(bins: ArrayLike<number>, binHz: number, hz: number): number {
  const n = bins.length;
  if (n === 0 || !(binHz > 0)) return 0;
  const lo = Math.max(1, Math.floor(hz / 1.26 / binHz));
  const hi = Math.min(n - 1, Math.max(lo, Math.ceil((hz * 1.26) / binHz)));
  let best = 0;
  for (let i = lo; i <= hi; i++) if (bins[i]! > best) best = bins[i]!;
  return best;
}

/**
 * Radii of the supply and take-up tape packs when a fraction `played` of the
 * tape has moved across. Tape has constant thickness, so it is the pack's
 * area, not its radius, that changes in proportion.
 */
export function reelRadii(
  played: number,
  empty: number,
  full: number,
  out: { supply: number; takeUp: number },
): void {
  const t = played <= 0 ? 0 : played >= 1 ? 1 : played;
  const span = full * full - empty * empty;
  out.supply = Math.sqrt(full * full - span * t);
  out.takeUp = Math.sqrt(empty * empty + span * t);
}
