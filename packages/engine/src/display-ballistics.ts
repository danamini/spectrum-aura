/**
 * Meter ballistics for the presentation spectrum: near-instant attack, and a
 * release that reproduces AnalyserNode smoothing.
 *
 * The analyser smooths linear magnitude and then converts to dB, so a level
 * decaying under smoothing τ falls at a constant −20·log10(τ) dB per frame.
 * Falling at that same slope keeps the settled look of the Smoothing slider
 * while a rising level no longer waits on the smoothing filter.
 *
 * Presentation only — tempo/onset detection keeps its own symmetric source.
 */
export const DISPLAY_ATTACK_RETAIN = 0.2;
/** AnalyserNode default dB window (minDecibels −100 … maxDecibels −30). */
const ANALYSER_DB_RANGE = 70;

/** Byte-scale fall per frame equivalent to analyser smoothing `release`. */
export function releaseStep(release: number): number {
  if (!(release > 0)) return 255;
  const clamped = release > 0.99 ? 0.99 : release;
  return Math.min(255, (-20 * Math.log10(clamped) * 255) / ANALYSER_DB_RANGE);
}

export class DisplayBallistics {
  bins = new Uint8Array(0);
  private level = new Float32Array(0);

  reset(): void {
    this.level.fill(0);
    this.bins.fill(0);
  }

  /** `release` is the per-frame retention while falling (the Smoothing slider). */
  process(raw: Uint8Array, release: number): Uint8Array {
    const n = raw.length;
    if (this.level.length !== n) {
      this.level = new Float32Array(n);
      this.bins = new Uint8Array(n);
    }
    const step = releaseStep(release);
    const level = this.level;
    const bins = this.bins;
    for (let i = 0; i < n; i++) {
      const v = raw[i]!;
      const prev = level[i]!;
      const next =
        v > prev
          ? prev * DISPLAY_ATTACK_RETAIN + v * (1 - DISPLAY_ATTACK_RETAIN)
          : Math.max(v, prev - step);
      level[i] = next;
      bins[i] = next + 0.5;
    }
    return bins;
  }
}
