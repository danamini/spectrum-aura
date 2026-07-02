/**
 * BPM Detection using multi-band onset fusion, peak intervals, and autocorrelation.
 *
 * Algorithm:
 * 1. Maintains a history of fused onset energy with timestamps
 * 2. Finds peaks via slope detection (local maxima)
 * 3. Estimates BPM from median peak interval
 * 4. Refines with autocorrelation tempogram on resampled onset envelope
 * 5. Blends estimates using confidence weighting
 * 6. Exposes beat phase for downbeat-synced visuals
 */

export type BPMTickResult = {
  bpm: number;
  confidence: number;
  beatPhase: number;
  bpmLocked: boolean;
};

export type BPMBandSample = {
  bass: number;
  mid: number;
  high: number;
  bassDelta?: number;
  midDelta?: number;
  highDelta?: number;
};

function isValidBpm(bpm: number): boolean {
  return bpm >= 65 && bpm <= 195;
}

/** Combined band energy below this reads as "no signal" for confidence decay —
 * an absolute floor only, used to seed/bound the adaptive check below so a
 * source that's truly silent forever doesn't get stuck with an
 * ever-shrinking relative floor. */
const SILENCE_ABSOLUTE_FLOOR = 0.01;
/** "Active" means combined band energy is at least this fraction of the
 * slow-moving long-term average — adapts to whatever the actual input level
 * is (mic gain, source volume) instead of assuming a fixed absolute scale.
 * A fixed absolute threshold here was miscalibrated against real captured
 * audio (mic/tab share), which commonly sits well below a synthetic test
 * signal's level, and caused false "silence" during normal quiet-but-present
 * playback — undermining BPM lock entirely on real input. */
const SILENCE_RELATIVE_RATIO = 0.2;
/** How long silence must persist before confidence starts decaying. */
const SILENCE_DECAY_AFTER_MS = 1200;
/** Per-analysis-pass decay factor once silence has persisted — mirrors the
 * proven EMA-decay shape in latency-metrics.ts's LATENCY_DECAY. */
const SILENCE_CONFIDENCE_DECAY = 0.85;

/** Relative tolerance for recognizing a candidate BPM as ~2x or ~0.5x the locked one. */
const OCTAVE_MATCH_TOLERANCE = 0.04;
/** Consecutive analysis passes a clean octave mismatch must persist before correcting the
 * lock in place — a distinctive 2x/0.5x match is a much stronger signal than generic
 * drift, so this is faster than the generic 12-pass drift-reject/unlock path. */
const OCTAVE_CORRECTION_STREAK = 6;

/**
 * True if `candidate` sits close to exactly 2x or 0.5x of `locked` — the classic
 * octave-detection error (e.g. locking onto every other beat), as opposed to a
 * generically different tempo estimate.
 */
export function isOctaveMismatch(
  locked: number,
  candidate: number,
  tolerance = OCTAVE_MATCH_TOLERANCE,
): boolean {
  if (locked <= 0 || candidate <= 0) return false;
  const doubleDiff = Math.abs(candidate - locked * 2) / (locked * 2);
  const halfDiff = Math.abs(candidate - locked * 0.5) / (locked * 0.5);
  return doubleDiff <= tolerance || halfDiff <= tolerance;
}

/**
 * Keep only intervals close to the median — real music's peak list mixes beat
 * onsets with hi-hat subdivisions and syncopation, so the raw interval list has
 * huge spread even when the underlying tempo is rock solid. Judging tempo (and
 * especially confidence) on the raw list is what kept real tracks from ever
 * locking: interval CV stayed high no matter how steady the music was.
 */
export function filterIntervalsAroundMedian(sortedIntervals: number[]): number[] {
  if (sortedIntervals.length < 3) return sortedIntervals;
  const median = sortedIntervals[Math.floor(sortedIntervals.length / 2)]!;
  const filtered = sortedIntervals.filter((iv) => iv >= median * 0.72 && iv <= median * 1.38);
  return filtered.length >= 2 ? filtered : sortedIntervals;
}

/** Candidate-BPM history window used by the stability lock — see applyBpmLock. */
const STABILITY_WINDOW = 5;
/** Lock when this many recent candidates agree within STABILITY_TOLERANCE. */
const STABILITY_LOCK_COUNT = 4;
/** Relative spread (of the window midpoint) the candidates must stay within. */
const STABILITY_TOLERANCE = 0.035;
/** Minimum confidence for the stability lock path — evidence of *some* rhythm. */
const STABILITY_MIN_CONFIDENCE = 0.3;

export class BPMDetector {
  private energyHistory: Array<{ energy: number; time: number }> = [];
  private windowSizeMs = 8000;
  private minPeakIntervalMs = 120;
  private peakThreshold = 1.08;
  private useSlopeDetection = true;

  private lastBPM = 0;
  private bpmSmoothingAlpha = 0.08;

  private cachedPeaks: Array<{ energy: number; time: number }> = [];
  private cachedConfidence = 0;
  private cachedBeatPhase = 0;
  private lastAnalysisAt = -Infinity;
  private analysisIntervalMs = 250;
  private lastFeedAt = -Infinity;
  private feedIntervalMs = 50;
  private lastFeedTime = 0;
  private lastPeakTime = 0;

  private lastBass = 0;
  private lastMid = 0;
  private lastHigh = 0;
  private lastActiveAt = 0;
  /** Slow-moving average of combined band energy — see SILENCE_RELATIVE_RATIO. */
  private longTermEnergy = 0;

  private bpmLocked = false;
  private tapLocked = false;
  private lockedBpm = 0;
  private phaseAnchorTime = 0;
  private highConfidenceStreak = 0;
  private tapTimes: number[] = [];
  private driftRejectStreak = 0;
  private octaveMismatchStreak = 0;
  /** Recent unlocked candidate BPMs, for the stability-based lock path. */
  private recentCandidates: number[] = [];

  private static clampBpm(bpm: number): number {
    let v = bpm;
    if (v < 80) v *= 2;
    if (v > 180) v *= 0.5;
    return Math.max(60, Math.min(200, v));
  }

  feed(energy: number, time: number): void {
    this.feedBands({ bass: energy, mid: energy * 0.35, high: energy * 0.15 }, time);
  }

  feedBands(bands: BPMBandSample, time: number): void {
    if (time - this.lastFeedAt < this.feedIntervalMs) return;
    this.lastFeedAt = time;
    this.lastFeedTime = time;

    const bassDelta = bands.bassDelta ?? bands.bass - this.lastBass;
    const midDelta = bands.midDelta ?? bands.mid - this.lastMid;
    const highDelta = bands.highDelta ?? bands.high - this.lastHigh;
    this.lastBass = bands.bass;
    this.lastMid = bands.mid;
    this.lastHigh = bands.high;

    const onset =
      Math.max(0, bassDelta) * 1 + Math.max(0, midDelta) * 0.55 + Math.max(0, highDelta) * 0.28;
    const energy = bands.bass * 0.68 + bands.mid * 0.24 + bands.high * 0.08 + onset * 0.35;

    const totalEnergy = bands.bass + bands.mid + bands.high;
    this.longTermEnergy =
      this.longTermEnergy <= 0 ? totalEnergy : this.longTermEnergy * 0.98 + totalEnergy * 0.02;
    const activeFloor = Math.max(
      SILENCE_ABSOLUTE_FLOOR,
      this.longTermEnergy * SILENCE_RELATIVE_RATIO,
    );
    if (totalEnergy > activeFloor) {
      this.lastActiveAt = time;
    }

    this.energyHistory.push({ energy, time });

    const cutoffTime = time - this.windowSizeMs;
    while (this.energyHistory.length > 0 && this.energyHistory[0].time < cutoffTime) {
      this.energyHistory.shift();
    }
  }

  /** Run peak analysis at most every `analysisIntervalMs`; phase updates every tick. */
  tick(time: number): BPMTickResult {
    this.analyzeIfNeeded(time);
    if (this.lastBPM > 0) {
      this.cachedBeatPhase = this.computeBeatPhase(time);
    }
    return {
      bpm: this.lastBPM,
      confidence: this.cachedConfidence,
      beatPhase: this.cachedBeatPhase,
      bpmLocked: this.bpmLocked,
    };
  }

  getBPM(): number {
    this.analyzeIfNeeded(this.lastFeedTime, true);
    return this.lastBPM;
  }

  getConfidence(): number {
    this.analyzeIfNeeded(this.lastFeedTime, true);
    return this.cachedConfidence;
  }

  getBeatPhase(): number {
    this.analyzeIfNeeded(this.lastFeedTime, true);
    return this.cachedBeatPhase;
  }

  isLocked(): boolean {
    return this.bpmLocked;
  }

  isTapLocked(): boolean {
    return this.tapLocked;
  }

  /**
   * Drop the manual tap-lock so auto-detection can try to reacquire BPM from
   * scratch — called by SongClock once it decides the tapped tempo has gone
   * stale (long silence or sustained misalignment; see
   * MANUAL_REACQUIRE_AFTER_MS in song-clock.ts). Otherwise `applyBpmLock()`'s
   * `tapLocked` early-return would keep discarding every fresh candidate BPM
   * forever, even though analysis keeps computing them under the hood.
   * Leaves `energyHistory`/`lastBPM` alone (not a hard reset) so re-acquisition
   * has a reasonable starting point instead of snapping to "no BPM at all".
   */
  releaseManualLock(): void {
    this.tapLocked = false;
    this.bpmLocked = false;
    this.lockedBpm = 0;
    this.highConfidenceStreak = 0;
    this.driftRejectStreak = 0;
    this.octaveMismatchStreak = 0;
    this.recentCandidates.length = 0;
  }

  /**
   * Manual beat tap — aligns phase and refines BPM from tap spacing.
   * Use `downbeat` to mark bar 1 beat 1.
   */
  hintBeat(time: number, downbeat = false, fallbackBpm = 0): void {
    this.tapTimes.push(time);
    if (this.tapTimes.length > 8) this.tapTimes.shift();

    this.phaseAnchorTime = time;
    this.cachedBeatPhase = 0;
    this.lastPeakTime = time;

    if (downbeat) {
      if (this.tapTimes.length >= 2) {
        const intervals: number[] = [];
        for (let i = 1; i < this.tapTimes.length; i++) {
          intervals.push(this.tapTimes[i]! - this.tapTimes[i - 1]!);
        }
        intervals.sort((a, b) => a - b);
        const medianInterval = intervals[Math.floor(intervals.length / 2)]!;
        if (medianInterval >= 250 && medianInterval <= 1200) {
          const tappedBpm = BPMDetector.clampBpm(60000 / medianInterval);
          this.lockedBpm = tappedBpm;
          this.lastBPM = tappedBpm;
          this.bpmLocked = true;
          this.tapLocked = true;
          this.cachedConfidence = Math.max(this.cachedConfidence, 0.88);
          this.highConfidenceStreak = 0;
          this.driftRejectStreak = 0;
          this.octaveMismatchStreak = 0;
          return;
        }
      }
      const bpm =
        this.lastBPM > 0
          ? this.lastBPM
          : isValidBpm(fallbackBpm)
            ? BPMDetector.clampBpm(fallbackBpm)
            : 0;
      if (bpm > 0) {
        this.lockedBpm = bpm;
        this.lastBPM = bpm;
        this.bpmLocked = true;
        this.tapLocked = true;
        this.cachedConfidence = Math.max(this.cachedConfidence, 0.82);
      }
      return;
    }

    if (this.tapTimes.length >= 2) {
      const intervals: number[] = [];
      for (let i = 1; i < this.tapTimes.length; i++) {
        intervals.push(this.tapTimes[i]! - this.tapTimes[i - 1]!);
      }
      intervals.sort((a, b) => a - b);
      const medianInterval = intervals[Math.floor(intervals.length / 2)]!;
      if (medianInterval >= 250 && medianInterval <= 1200) {
        const tappedBpm = BPMDetector.clampBpm(60000 / medianInterval);
        this.lockedBpm = tappedBpm;
        this.lastBPM = tappedBpm;
        this.bpmLocked = true;
        this.tapLocked = true;
        this.cachedConfidence = Math.max(this.cachedConfidence, 0.88);
        this.highConfidenceStreak = 0;
        this.driftRejectStreak = 0;
        this.octaveMismatchStreak = 0;
      }
    }
  }

  reset(): void {
    this.energyHistory = [];
    this.lastBPM = 0;
    this.cachedPeaks = [];
    this.cachedConfidence = 0;
    this.cachedBeatPhase = 0;
    this.lastAnalysisAt = -Infinity;
    this.lastFeedAt = -Infinity;
    this.lastFeedTime = 0;
    this.lastPeakTime = 0;
    this.lastBass = 0;
    this.lastMid = 0;
    this.lastHigh = 0;
    this.lastActiveAt = 0;
    this.longTermEnergy = 0;
    this.bpmLocked = false;
    this.tapLocked = false;
    this.lockedBpm = 0;
    this.phaseAnchorTime = 0;
    this.highConfidenceStreak = 0;
    this.tapTimes = [];
    this.driftRejectStreak = 0;
    this.octaveMismatchStreak = 0;
    this.recentCandidates.length = 0;
  }

  private analyzeIfNeeded(time: number, force = false): void {
    if (!force && time - this.lastAnalysisAt < this.analysisIntervalMs) return;
    this.lastAnalysisAt = time;
    this.cachedPeaks = this.findPeaks();
    const peakBpm = this.computeBpmFromPeaks(this.cachedPeaks);
    // Autocorrelation runs on the whole energy envelope, so it sees through the
    // subdivision/syncopation noise that pollutes the peak-interval estimate —
    // run it every analysis pass (it was previously gated on having almost no
    // peaks, which real music never satisfies, so it effectively never ran; and
    // post-lock tracking on peak intervals alone let a biased peak stream walk
    // the lock into the drift-reject unlock path on real music).
    const { bpm: autoBpm, strength: autoStrength } = this.computeAutocorrelationBpm(time);
    const candidateBpm = this.blendBpmEstimates(peakBpm, autoBpm, autoStrength);
    this.cachedConfidence = this.computeConfidenceFromPeaks(this.cachedPeaks, autoStrength);
    // Two independent estimators (peak intervals vs autocorrelation) agreeing on
    // the same tempo is strong evidence even when either one alone is noisy.
    if (!this.bpmLocked && peakBpm > 0 && autoBpm > 0) {
      const relDiff = Math.abs(peakBpm - autoBpm) / peakBpm;
      if (relDiff < 0.05) {
        this.cachedConfidence = Math.max(
          this.cachedConfidence,
          Math.min(0.85, 0.55 + autoStrength * 0.5),
        );
      }
    }
    if (this.tapLocked) {
      this.cachedConfidence = Math.max(this.cachedConfidence, 0.88);
    }
    // Decay confidence in proportion to how long real silence has persisted, so a
    // tap-locked confidence floor (or a stale peak-based estimate) doesn't read as
    // "still locked" indefinitely through a silent passage or the gap between songs.
    // Scaled by elapsed silence rather than a flat one-shot multiply, since this
    // analysis pass recomputes cachedConfidence fresh every time — a fixed factor
    // would apply the same single haircut regardless of how long it's been quiet.
    const silentMs = time - this.lastActiveAt - SILENCE_DECAY_AFTER_MS;
    if (silentMs > 0) {
      const decaySteps = silentMs / this.analysisIntervalMs;
      this.cachedConfidence *= Math.pow(SILENCE_CONFIDENCE_DECAY, decaySteps);
    }
    this.lastBPM = this.applyBpmLock(candidateBpm);
    if (this.cachedPeaks.length > 0) {
      const latestPeak = this.cachedPeaks[this.cachedPeaks.length - 1]!.time;
      this.lastPeakTime = latestPeak;
      this.snapPhaseToPeak(latestPeak);
    }
  }

  private applyBpmLock(candidateBpm: number): number {
    if (this.tapLocked) {
      const locked = this.lockedBpm > 0 ? this.lockedBpm : this.lastBPM;
      this.lastBPM = locked;
      return locked;
    }

    if (candidateBpm <= 0 && !this.bpmLocked) return this.lastBPM;

    if (!this.bpmLocked) {
      if (this.cachedConfidence > 0.62 && candidateBpm > 0) {
        this.highConfidenceStreak += 1;
      } else {
        this.highConfidenceStreak = 0;
      }

      // Stability lock: real music rarely sustains the high-confidence streak
      // (interval CV is inherently jittery), but the *estimate itself* settles
      // fast — if the candidate has stayed put across several analysis passes
      // with at least moderate confidence, that steadiness is the lock signal.
      let stable = false;
      if (candidateBpm > 0) {
        this.recentCandidates.push(candidateBpm);
        if (this.recentCandidates.length > STABILITY_WINDOW) this.recentCandidates.shift();
        if (
          this.recentCandidates.length >= STABILITY_LOCK_COUNT &&
          this.cachedConfidence >= STABILITY_MIN_CONFIDENCE
        ) {
          const recent = this.recentCandidates.slice(-STABILITY_LOCK_COUNT);
          const mn = Math.min(...recent);
          const mx = Math.max(...recent);
          stable = mx - mn <= ((mn + mx) / 2) * STABILITY_TOLERANCE;
        }
      }

      if ((this.highConfidenceStreak >= 4 || stable) && candidateBpm > 0) {
        this.bpmLocked = true;
        this.lockedBpm = candidateBpm;
        this.recentCandidates.length = 0;
        // Reflect the lock in the reported confidence — the stability path can
        // fire while instantaneous interval-CV confidence reads low even though
        // the tempo evidence is solid.
        this.cachedConfidence = Math.max(this.cachedConfidence, 0.68);
        if (this.phaseAnchorTime <= 0 && this.lastPeakTime > 0) {
          this.phaseAnchorTime = this.lastPeakTime;
        }
      }
      return candidateBpm > 0 ? candidateBpm : this.lastBPM;
    }

    const locked = this.lockedBpm > 0 ? this.lockedBpm : this.lastBPM;
    if (candidateBpm <= 0) return locked;

    const diff = Math.abs(candidateBpm - locked);
    if (diff <= 4) {
      this.driftRejectStreak = 0;
      this.octaveMismatchStreak = 0;
      this.lockedBpm = locked * 0.97 + candidateBpm * 0.03;
      this.lastBPM = this.lockedBpm;
      // Fresh evidence agreeing with the lock — keep reported confidence up so
      // the HUD reads "locked and tracking" instead of drifting toward zero on
      // interval-CV noise. Only fires on agreeing candidates, so true silence
      // (no candidates at all) still decays confidence normally.
      this.cachedConfidence = Math.max(this.cachedConfidence, 0.72);
      return this.lockedBpm;
    }

    // A clean 2x/0.5x match (e.g. locked onto every other beat) is a much more
    // distinctive signal than generic drift, so correct it faster than waiting on
    // the generic drift-reject/unlock path below.
    if (isOctaveMismatch(locked, candidateBpm)) {
      this.octaveMismatchStreak += 1;
      if (this.octaveMismatchStreak >= OCTAVE_CORRECTION_STREAK) {
        this.lockedBpm = candidateBpm;
        this.lastBPM = candidateBpm;
        this.octaveMismatchStreak = 0;
        this.driftRejectStreak = 0;
        return this.lockedBpm;
      }
      return locked;
    }
    this.octaveMismatchStreak = 0;

    this.driftRejectStreak += 1;
    if (this.driftRejectStreak >= 12 && diff > 8) {
      this.bpmLocked = false;
      this.lockedBpm = 0;
      this.highConfidenceStreak = 0;
      this.driftRejectStreak = 0;
      return candidateBpm;
    }

    return locked;
  }

  private snapPhaseToPeak(peakTime: number): void {
    if (this.tapLocked) return;
    if (!this.bpmLocked || this.lastBPM <= 0 || this.phaseAnchorTime <= 0) return;
    const periodMs = 60000 / this.lastBPM;
    const beatsSince = Math.round((peakTime - this.phaseAnchorTime) / periodMs) || 0;
    const expected = this.phaseAnchorTime + beatsSince * periodMs;
    if (Math.abs(peakTime - expected) < periodMs * 0.18) {
      this.phaseAnchorTime = expected * 0.35 + peakTime * 0.65;
    }
  }

  private blendBpmEstimates(peakBpm: number, autoBpm: number, autoStrength: number): number {
    if (peakBpm <= 0 && autoBpm <= 0) return this.lastBPM;
    if (peakBpm <= 0) return autoBpm;
    if (autoBpm <= 0 || autoStrength < 0.12) return peakBpm;

    const diff = Math.abs(peakBpm - autoBpm);
    const harmonicMatch =
      diff < 8 || Math.abs(peakBpm - autoBpm * 2) < 10 || Math.abs(peakBpm * 2 - autoBpm) < 10;
    if (!harmonicMatch) return peakBpm;

    const autoWeight = Math.min(0.35, autoStrength * 0.45);
    const blended = peakBpm * (1 - autoWeight) + autoBpm * autoWeight;
    const alpha =
      autoStrength > 0.45 && diff < 4
        ? this.bpmSmoothingAlpha * 1.25
        : diff > 5
          ? this.bpmSmoothingAlpha * 0.65
          : this.bpmSmoothingAlpha;
    return this.lastBPM * (1 - alpha) + blended * alpha;
  }

  private computeAutocorrelationBpm(time: number): { bpm: number; strength: number } {
    if (this.energyHistory.length < 12) return { bpm: 0, strength: 0 };

    const binMs = 25;
    const binCount = Math.floor(this.windowSizeMs / binMs);
    const envelope = new Float32Array(binCount);
    const startTime = time - this.windowSizeMs;

    for (const sample of this.energyHistory) {
      const idx = Math.floor((sample.time - startTime) / binMs);
      if (idx >= 0 && idx < binCount) {
        envelope[idx] = Math.max(envelope[idx]!, sample.energy);
      }
    }

    const minLag = Math.max(2, Math.floor(60000 / 200 / binMs));
    const maxLag = Math.min(binCount - 2, Math.ceil(60000 / 60 / binMs));
    let bestLag = 0;
    let bestScore = 0;
    let secondScore = 0;
    const scores: number[] = [];

    for (let lag = minLag; lag <= maxLag; lag++) {
      let sum = 0;
      let count = 0;
      for (let i = lag; i < binCount; i++) {
        sum += envelope[i]! * envelope[i - lag]!;
        count++;
      }
      const score = count > 0 ? sum / count : 0;
      scores.push(score);
      if (score > bestScore) {
        secondScore = bestScore;
        bestScore = score;
        bestLag = lag;
      } else if (score > secondScore) {
        secondScore = score;
      }
    }

    if (bestLag <= 0 || bestScore <= 0) return { bpm: 0, strength: 0 };

    const lagIdx = bestLag - minLag;
    let refinedLag = bestLag;
    if (lagIdx > 0 && lagIdx < scores.length - 1) {
      const y0 = scores[lagIdx - 1]!;
      const y1 = scores[lagIdx]!;
      const y2 = scores[lagIdx + 1]!;
      const denom = y0 - 2 * y1 + y2;
      if (Math.abs(denom) > 1e-9) {
        refinedLag = bestLag + (0.5 * (y0 - y2)) / denom;
      }
    }

    const intervalMs = refinedLag * binMs;
    let bpm = 60000 / intervalMs;
    if (bpm < 80) bpm *= 2;
    if (bpm > 180) bpm *= 0.5;
    bpm = Math.max(60, Math.min(200, bpm));

    const strength = secondScore > 0 ? (bestScore - secondScore) / bestScore : bestScore;
    return { bpm, strength: Math.max(0, Math.min(1, strength)) };
  }

  private computeBeatPhase(time: number): number {
    if (this.lastBPM <= 0) return 0;
    if (this.cachedConfidence < 0.25 && !this.bpmLocked && !this.tapLocked) return 0;
    const periodMs = 60000 / this.lastBPM;
    const anchor =
      this.phaseAnchorTime > 0
        ? this.phaseAnchorTime
        : this.lastPeakTime > 0
          ? this.lastPeakTime
          : this.lastFeedTime;
    const elapsed = Math.max(0, time - anchor);
    return (elapsed % periodMs) / periodMs;
  }

  private computeBpmFromPeaks(peaks: Array<{ energy: number; time: number }>): number {
    if (this.energyHistory.length < 5 || peaks.length < 2) return 0;

    const refinedTimes = peaks.map((peak) => this.refinePeakTime(peak));
    const intervals: number[] = [];
    for (let i = 1; i < refinedTimes.length; i++) {
      intervals.push(refinedTimes[i] - refinedTimes[i - 1]);
    }
    if (intervals.length === 0) return 0;

    intervals.sort((a, b) => a - b);
    const seedMedian = intervals[Math.floor(intervals.length / 2)]!;
    // Fold subdivision (hi-hat 8ths/16ths) and skipped-beat intervals into the
    // median's octave so they count as *evidence for* the beat period instead
    // of polluting the median — real music's peak stream is a mixture, and the
    // raw median wanders with whichever layer produced more peaks this window.
    const folded = intervals.map((iv) => {
      let v = iv;
      while (v < seedMedian * 0.72) v *= 2;
      while (v > seedMedian * 1.45) v /= 2;
      return v;
    });
    folded.sort((a, b) => a - b);
    const medianInterval = folded[Math.floor(folded.length / 2)]!;

    let bpm = 60000 / medianInterval;
    bpm = BPMDetector.clampBpm(bpm);
    return bpm;
  }

  private refinePeakTime(peak: { energy: number; time: number }): number {
    const history = this.energyHistory;
    const idx = history.findIndex((s) => s.time === peak.time);
    if (idx <= 0 || idx >= history.length - 1) return peak.time;

    const prev = history[idx - 1]!;
    const curr = history[idx]!;
    const next = history[idx + 1]!;
    const denom = prev.energy - 2 * curr.energy + next.energy;
    if (Math.abs(denom) < 1e-9) return peak.time;

    const offset = (0.5 * (prev.energy - next.energy)) / denom;
    const clamped = Math.max(-0.5, Math.min(0.5, offset));
    return curr.time + clamped * (next.time - prev.time);
  }

  private computeConfidenceFromPeaks(
    peaks: Array<{ energy: number; time: number }>,
    autoStrength: number,
  ): number {
    if (this.energyHistory.length < 5) return 0;
    if (peaks.length < 2) return autoStrength * 0.35;
    if (peaks.length < 3) return Math.max(0.25, autoStrength * 0.5);

    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i].time - peaks[i - 1].time);
    }
    if (intervals.length < 2) return Math.max(0.35, autoStrength * 0.55);

    // Judge consistency on the median-filtered intervals — mixed subdivision/
    // syncopation intervals otherwise inflate CV so much that steady real music
    // never reads as confident (see filterIntervalsAroundMedian).
    intervals.sort((a, b) => a - b);
    const filtered = filterIntervalsAroundMedian(intervals);
    const mean = filtered.reduce((a, b) => a + b, 0) / filtered.length;
    const variance = filtered.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / filtered.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;
    // How much of the raw evidence actually fits the dominant tempo — a low
    // fraction means the "consistent" cluster is a minority of what's playing.
    const clusterFraction = filtered.length / intervals.length;

    let confidence = (1 - cv * 3) * (0.55 + clusterFraction * 0.45);
    confidence = Math.max(0, Math.min(1, confidence));
    const peakBonus = Math.min(0.2, (peaks.length - 3) * 0.05);
    const autoBonus = autoStrength * 0.25;
    return Math.min(1, confidence + peakBonus + autoBonus);
  }

  private findPeaks(): Array<{ energy: number; time: number }> {
    if (this.energyHistory.length < 5) return [];

    const peaks: typeof this.energyHistory = [];
    const history = this.energyHistory;

    const shortWindow = Math.min(12, history.length);
    const shortSlice = history.slice(-shortWindow);
    const shortAvg = shortSlice.reduce((s, e) => s + e.energy, 0) / shortWindow;
    const longAvg = history.reduce((s, e) => s + e.energy, 0) / history.length;
    const shortVar =
      shortSlice.reduce((s, e) => s + Math.pow(e.energy - shortAvg, 2), 0) / shortWindow;
    const adaptiveFloor = longAvg + Math.sqrt(shortVar) * (shortAvg > longAvg * 1.05 ? 0.6 : 0.9);

    if (this.lastBPM > 0) {
      this.minPeakIntervalMs = Math.max(120, Math.min(900, (60000 / this.lastBPM) * 0.42));
    }

    if (this.useSlopeDetection) {
      let lastPeakTime = -Infinity;
      let wasRising = false;

      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const isRising = curr.energy > prev.energy;

        if (wasRising && !isRising && prev.energy >= adaptiveFloor * 0.5) {
          const timeSinceLast = prev.time - lastPeakTime;
          if (timeSinceLast >= this.minPeakIntervalMs) {
            peaks.push(prev);
            lastPeakTime = prev.time;
          }
        }

        wasRising = isRising;
      }
    } else {
      const threshold = Math.max(adaptiveFloor, longAvg * this.peakThreshold);

      for (let i = 1; i < history.length - 1; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const next = history[i + 1];

        if (curr.energy > threshold && curr.energy >= prev.energy && curr.energy >= next.energy) {
          const timeSinceLast =
            peaks.length === 0 ? Infinity : curr.time - peaks[peaks.length - 1].time;
          if (timeSinceLast >= this.minPeakIntervalMs) {
            peaks.push(curr);
          }
        }
      }
    }

    return peaks;
  }
}
