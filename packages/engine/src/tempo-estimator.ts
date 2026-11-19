/**
 * Tempo from the periodicity of the onset envelope.
 *
 * Onset strength is accumulated on a fixed 10 ms grid whatever the caller's
 * frame rate, and the tempo is the beat period whose multiples all line up
 * with the envelope's autocorrelation: a true beat period L correlates at L,
 * 2L, 3L and 4L, while the 3:2 and 4:3 relatives that fool an interval-median
 * estimate only line up at one of those. The winning period is then refined
 * against its four-beat multiple, which is four times as precise as the beat
 * lag itself.
 *
 * Unlike peak-interval timing this needs no decision about which onsets are
 * "the beat", so a kick on 1 and 3 with a snare on 2 and 4 is as easy as a
 * four-on-the-floor kick.
 */
const BIN_MS = 10;
const WINDOW_MS = 12000;
const BINS = WINDOW_MS / BIN_MS;
/** Shortest history worth analysing. */
const MIN_ANALYSIS_MS = 2500;
/** Beat periods considered, as tempo: one octave-and-a-bit, matching the
 * detector's fold range so every tempo has exactly one home. */
const MIN_BPM = 80;
const MAX_BPM = 180;
const HARMONIC_WEIGHTS = [1, 0.9, 0.5, 0.8] as const;
/** Listeners' preferred tempo; breaks ties between a tempo and its double. */
const PRIOR_CENTRE_BPM = 125;
const PRIOR_SIGMA_OCTAVES = 0.8;

export type TempoEstimate = { bpm: number; strength: number };

export class TempoEstimator {
  private readonly ring = new Float32Array(BINS);
  private readonly work = new Float32Array(BINS);
  private acf = new Float32Array(0);
  private headBin = -1;
  private firstBin = -1;

  reset(): void {
    this.ring.fill(0);
    this.headBin = -1;
    this.firstBin = -1;
  }

  /** Adds `onset` (≥ 0) arriving over the interval since the previous call. */
  feed(onset: number, time: number): void {
    const bin = Math.floor(time / BIN_MS);
    if (this.headBin < 0 || bin < this.headBin || bin - this.headBin > BINS) {
      this.reset();
      this.headBin = bin;
      this.firstBin = bin;
      return;
    }
    // Clear the bins the head moves across, then spread the onset over them
    // so a 60 Hz caller does not leave every other bin empty.
    const span = bin - this.headBin;
    for (let b = this.headBin + 1; b <= bin; b++) this.ring[b % BINS] = 0;
    const value = onset > 0 ? onset : 0;
    if (span === 0) {
      this.ring[bin % BINS]! += value;
    } else {
      const share = value / span;
      for (let b = this.headBin + 1; b <= bin; b++) this.ring[b % BINS]! += share;
    }
    this.headBin = bin;
  }

  /** How much onset history is held, in milliseconds. */
  historyMs(): number {
    return this.headBin < 0 ? 0 : Math.min(BINS, this.headBin - this.firstBin + 1) * BIN_MS;
  }

  estimate(): TempoEstimate {
    const none = { bpm: 0, strength: 0 };
    if (this.headBin < 0) return none;
    const n = Math.min(BINS, this.headBin - this.firstBin + 1);
    if (n * BIN_MS < MIN_ANALYSIS_MS) return none;

    // Oldest → newest, mean removed.
    const x = this.work;
    let mean = 0;
    for (let i = 0; i < n; i++) {
      const v = this.ring[(this.headBin - n + 1 + i + BINS * 2) % BINS]!;
      x[i] = v;
      mean += v;
    }
    mean /= n;
    let energy = 0;
    for (let i = 0; i < n; i++) {
      x[i]! -= mean;
      energy += x[i]! * x[i]!;
    }
    energy /= n;
    if (!(energy > 1e-12)) return none;

    const minLag = 60000 / MAX_BPM / BIN_MS;
    const maxBeatLag = 60000 / MIN_BPM / BIN_MS;
    // Lags beyond half the history have too few terms to trust.
    const maxLag = Math.min(Math.floor(n / 2), Math.ceil(maxBeatLag * HARMONIC_WEIGHTS.length) + 2);
    if (maxLag < minLag * 2) return none;
    if (this.acf.length < maxLag + 2) this.acf = new Float32Array(maxLag + 2);
    const acf = this.acf;
    for (let lag = 1; lag <= maxLag + 1; lag++) {
      let sum = 0;
      for (let i = lag; i < n; i++) sum += x[i]! * x[i - lag]!;
      acf[lag] = sum / (n - lag) / energy;
    }
    const at = (lag: number) => {
      const lo = Math.floor(lag);
      if (lo < 1 || lo >= maxLag) return 0;
      const frac = lag - lo;
      return acf[lo]! * (1 - frac) + acf[lo + 1]! * frac;
    };

    let bestLag = 0;
    let bestScore = -Infinity;
    let bestRaw = 0;
    const scores: Array<[number, number]> = [];
    for (let lag = minLag; lag <= maxBeatLag; lag += 0.25) {
      let score = 0;
      let weight = 0;
      for (let k = 0; k < HARMONIC_WEIGHTS.length; k++) {
        const multiple = lag * (k + 1);
        if (multiple >= maxLag) break;
        score += HARMONIC_WEIGHTS[k]! * at(multiple);
        weight += HARMONIC_WEIGHTS[k]!;
      }
      if (weight <= 0) continue;
      const raw = score / weight;
      const octaves = Math.log2(60000 / (lag * BIN_MS) / PRIOR_CENTRE_BPM) / PRIOR_SIGMA_OCTAVES;
      const weighted = raw * Math.exp(-0.5 * octaves * octaves);
      scores.push([lag, weighted]);
      if (weighted > bestScore) {
        bestScore = weighted;
        bestLag = lag;
        bestRaw = raw;
      }
    }
    if (bestLag <= 0 || bestRaw <= 0) return none;

    // Best rival that is a genuinely different tempo, not the same peak's shoulder.
    let rival = 0;
    for (const [lag, score] of scores) {
      if (Math.abs(lag - bestLag) / bestLag > 0.06 && score > rival) rival = score;
    }

    // Refine against the longest multiple available: a peak near 4L located
    // to a fraction of a bin fixes L four times as finely.
    let refined = bestLag;
    for (let k = HARMONIC_WEIGHTS.length; k >= 2; k--) {
      const target = bestLag * k;
      if (target * 1.02 >= maxLag) continue;
      let peak = Math.round(target);
      const lo = Math.max(2, Math.floor(target * 0.985));
      const hi = Math.min(maxLag - 1, Math.ceil(target * 1.015));
      for (let lag = lo; lag <= hi; lag++) if (acf[lag]! > acf[peak]!) peak = lag;
      if (!(acf[peak]! > 0)) continue;
      const y0 = acf[peak - 1]!;
      const y1 = acf[peak]!;
      const y2 = acf[peak + 1]!;
      const denom = y0 - 2 * y1 + y2;
      const offset = Math.abs(denom) > 1e-9 ? (0.5 * (y0 - y2)) / denom : 0;
      refined = (peak + Math.max(-0.5, Math.min(0.5, offset))) / k;
      break;
    }

    const contrast = bestScore > 0 ? Math.max(0, 1 - rival / bestScore) : 0;
    const periodicity = Math.max(0, Math.min(1, bestRaw * 1.6));
    return {
      bpm: 60000 / (refined * BIN_MS),
      strength: Math.max(0, Math.min(1, periodicity * (0.45 + 0.55 * Math.min(1, contrast * 2.5)))),
    };
  }
}
