/**
 * Adaptive multi-band beat and signal-change detection.
 * Fuses bass/mid/high onset energy with rolling statistics for stable triggers.
 */

export type BeatMatchResult = {
  beat: boolean;
  onsetStrength: number;
  signalSwing: boolean;
  adaptiveFloor: number;
  bassDelta: number;
  midDelta: number;
};

export class BeatMatcher {
  private bassRing = new Float32Array(43);
  private midRing = new Float32Array(43);
  private bassRingIdx = 0;
  private bassRingCount = 0;
  private bassRingSum = 0;
  private midRingSum = 0;
  private lastBeat = 0;
  private lastBass = 0;
  private lastMid = 0;
  private lastHigh = 0;
  private lastCentroid = 0;
  private lastSignalChangeAt = 0;

  reset(): void {
    this.bassRingIdx = 0;
    this.bassRingCount = 0;
    this.bassRingSum = 0;
    this.midRingSum = 0;
    this.bassRing.fill(0);
    this.midRing.fill(0);
    this.lastBeat = 0;
    this.lastBass = 0;
    this.lastMid = 0;
    this.lastHigh = 0;
    this.lastCentroid = 0;
    this.lastSignalChangeAt = 0;
  }

  get signalChangeAt(): number {
    return this.lastSignalChangeAt;
  }

  detect(
    bass: number,
    mid: number,
    high: number,
    centroid: number,
    beatThreshold: number,
    now: number,
    /** Last known BPM estimate, used to scale the refractory gap once confident. */
    estimatedBpm = 0,
    bpmConfident = false,
  ): BeatMatchResult {
    const bassDelta = bass - this.lastBass;
    const midDelta = mid - this.lastMid;
    const highDelta = high - this.lastHigh;
    const centroidDelta = centroid - this.lastCentroid;

    const onsetStrength =
      Math.max(0, bassDelta) * 1 +
      Math.max(0, midDelta) * 0.55 +
      Math.max(0, highDelta) * 0.3 +
      Math.max(0, centroidDelta) * 0.15;

    const swingMagnitude =
      Math.abs(bassDelta) + Math.abs(midDelta) * 0.7 + Math.abs(highDelta) * 0.45;
    const signalSwing =
      swingMagnitude > 0.11 ||
      Math.abs(centroidDelta) > 0.045 ||
      (Math.abs(bassDelta) > 0.06 && Math.abs(midDelta) > 0.04);

    if (signalSwing) {
      this.lastSignalChangeAt = now;
    }

    this.lastBass = bass;
    this.lastMid = mid;
    this.lastHigh = high;
    this.lastCentroid = centroid;

    const oldBass = this.bassRing[this.bassRingIdx];
    this.bassRingSum += bass - (this.bassRingCount === 43 ? oldBass : 0);
    this.midRingSum += mid - (this.bassRingCount === 43 ? this.midRing[this.bassRingIdx] : 0);
    this.bassRing[this.bassRingIdx] = bass;
    this.midRing[this.bassRingIdx] = mid;
    this.bassRingIdx = (this.bassRingIdx + 1) % 43;
    this.bassRingCount = Math.min(43, this.bassRingCount + 1);

    const bassAvg = this.bassRingSum / this.bassRingCount;
    const midAvg = this.midRingSum / this.bassRingCount;
    const longTerm = bassAvg * 0.72 + midAvg * 0.28;
    const adaptiveFloor = Math.max(0.12, longTerm * 0.78);
    const adaptiveThreshold = Math.max(adaptiveFloor * 1.05, bassAvg * beatThreshold);

    // Once a confident tempo is known, scale the refractory gap to ~35% of the beat
    // period instead of the fixed 160/180ms guess, which was too tight for slow
    // tempos (e.g. reggae/ballads) and too loose for fast ones (e.g. drum & bass).
    const minGapMs =
      bpmConfident && estimatedBpm > 0
        ? Math.max(100, Math.min(220, (60000 / estimatedBpm) * 0.35))
        : longTerm > 0.35
          ? 160
          : 180;
    const gapOk = now - this.lastBeat >= minGapMs;

    const bassSpike = bass > adaptiveThreshold && bass > adaptiveFloor && gapOk;
    const fusionBeat =
      onsetStrength > 0.075 &&
      bass > adaptiveFloor * 0.92 &&
      (bass > bassAvg * (beatThreshold * 0.82) || mid > midAvg * 1.08) &&
      gapOk;

    let beat = false;
    if (bassSpike || fusionBeat) {
      beat = true;
      this.lastBeat = now;
    }

    return { beat, onsetStrength, signalSwing, adaptiveFloor, bassDelta, midDelta };
  }
}
