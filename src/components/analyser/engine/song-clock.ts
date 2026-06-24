/**
 * Authoritative musical clock for bar/phrase grid, view cycling, and visual beat phase.
 *
 * Manual taps (T / Shift+T) establish epoch and BPM. After tap sync is complete,
 * confident audio onsets may nudge phase and eventually resume auto correction.
 */

export const BEATS_PER_BAR = 4;
export const BEATS_PER_PHRASE = 16;
export const BARS_PER_PHRASE = BEATS_PER_PHRASE / BEATS_PER_BAR;

export const TAP_TIMEOUT_MS = 2000;
export const MANUAL_RELEASE_STREAK = 8;
const MIN_TAP_INTERVAL_MS = 250;
const MAX_TAP_INTERVAL_MS = 1200;
const AUTO_CONFIDENCE_THRESHOLD = 0.62;
const AUTO_BPM_MIN = 65;
const AUTO_BPM_MAX = 195;
const MANUAL_AUDIO_CONFIDENCE = 0.55;
const MANUAL_AUDIO_ONSET = 0.06;
const MANUAL_ALIGN_WINDOW = 0.22;
const PHRASE_CHANGE_THRESHOLD = 0.14;
const PHRASE_ONSET_MIN = 0.08;

export type ClockSource = "idle" | "auto" | "manual";

export type BarTiming = {
  source: ClockSource;
  synced: boolean;
  bpmLocked: boolean;
  clockBpm: number;
  beatInBar: number;
  beatInPhrase: number;
  barInPhrase: number;
  beatPhase: number;
  barPhase: number;
  phrasePhase: number;
  totalBeats: number;
  beatJustTicked: boolean;
  barJustStarted: boolean;
  phraseJustStarted: boolean;
  /** True when a 4-bar spectral change suggested a phrase downbeat this frame. */
  phraseChangeDetected?: boolean;
};

export const EMPTY_BAR_TIMING: BarTiming = {
  source: "idle",
  synced: false,
  bpmLocked: false,
  clockBpm: 0,
  beatInBar: 1,
  beatInPhrase: 1,
  barInPhrase: 1,
  beatPhase: 0,
  barPhase: 0,
  phrasePhase: 0,
  totalBeats: 0,
  beatJustTicked: false,
  barJustStarted: false,
  phraseJustStarted: false,
};

export type SongClockTickInput = {
  now: number;
  estimatedBpm: number;
  bpmConfidence: number;
  bpmLocked: boolean;
  /** BeatMatcher onset — used for manual assist and phrase-change detection. */
  audioBeat?: boolean;
  onsetStrength?: number;
  bass?: number;
  mid?: number;
  centroid?: number;
};

type BarSignature = { bass: number; mid: number; centroid: number };

function clampBpm(bpm: number): number {
  let v = bpm;
  if (v < 80) v *= 2;
  if (v > 180) v *= 0.5;
  return Math.max(60, Math.min(200, v));
}

function isValidBpm(bpm: number): boolean {
  return bpm >= AUTO_BPM_MIN && bpm <= AUTO_BPM_MAX;
}

function timingFromBeatFloat(
  beatFloat: number,
  source: ClockSource,
  clockBpm: number,
  bpmLocked: boolean,
  prevTotalBeats: number,
  downbeatLatch: boolean,
): BarTiming {
  const phraseBeatFloat =
    ((beatFloat % BEATS_PER_PHRASE) + BEATS_PER_PHRASE) % BEATS_PER_PHRASE;
  const beatInPhrase = Math.floor(phraseBeatFloat) + 1;
  const beatPhase = phraseBeatFloat - Math.floor(phraseBeatFloat);
  const beatInBar = ((beatInPhrase - 1) % BEATS_PER_BAR) + 1;
  const barInPhrase = Math.floor((beatInPhrase - 1) / BEATS_PER_BAR) + 1;
  const barPhase = Math.min(1, (beatInBar - 1 + beatPhase) / BEATS_PER_BAR);
  const phrasePhase = phraseBeatFloat / BEATS_PER_PHRASE;
  const totalBeats = Math.max(1, Math.floor(beatFloat) + 1);
  const beatJustTicked = totalBeats > prevTotalBeats || downbeatLatch;
  const barJustStarted = beatJustTicked && beatInBar === 1;
  const phraseJustStarted =
    beatJustTicked && beatInPhrase === 1 && (totalBeats > 1 || downbeatLatch);

  return {
    source,
    synced: source !== "idle",
    bpmLocked: bpmLocked || source === "manual",
    clockBpm,
    beatInBar,
    beatInPhrase,
    barInPhrase,
    beatPhase,
    barPhase,
    phrasePhase,
    totalBeats,
    beatJustTicked,
    barJustStarted,
    phraseJustStarted,
  };
}

function signatureDistance(a: BarSignature, b: BarSignature): number {
  return (
    Math.abs(a.bass - b.bass) * 0.55 +
    Math.abs(a.mid - b.mid) * 0.3 +
    Math.abs(a.centroid - b.centroid) * 0.15
  );
}

export class SongClock {
  private source: ClockSource = "idle";
  private clockBpm = 0;
  private epochMs = 0;
  private epochBeatNumber = 1;
  private epochSet = false;
  private lastTotalBeats = 0;
  private tapTimes: number[] = [];
  private lastTapMs = 0;
  private autoConfidenceStreak = 0;
  private manualTapComplete = false;
  private downbeatLatch = false;
  private audioAlignStreak = 0;
  private lastAudioBeatMs = 0;
  private barSampleSum = { bass: 0, mid: 0, centroid: 0, n: 0 };
  private recentBars: BarSignature[] = [];

  reset(): void {
    this.source = "idle";
    this.clockBpm = 0;
    this.epochMs = 0;
    this.epochBeatNumber = 1;
    this.epochSet = false;
    this.lastTotalBeats = 0;
    this.tapTimes = [];
    this.lastTapMs = 0;
    this.autoConfidenceStreak = 0;
    this.manualTapComplete = false;
    this.downbeatLatch = false;
    this.audioAlignStreak = 0;
    this.lastAudioBeatMs = 0;
    this.barSampleSum = { bass: 0, mid: 0, centroid: 0, n: 0 };
    this.recentBars = [];
  }

  getSource(): ClockSource {
    return this.source;
  }

  getClockBpm(): number {
    return this.clockBpm;
  }

  isManualTapComplete(): boolean {
    return this.manualTapComplete;
  }

  /** Shift+T — phrase downbeat: beat 1 / bar 1 at `now`. */
  hintDownbeat(now: number, fallbackBpm = 0): void {
    this.recordTap(now);
    const tapBpm = this.medianTapBpm();
    if (tapBpm > 0) {
      this.clockBpm = tapBpm;
    } else if (isValidBpm(fallbackBpm)) {
      this.clockBpm = fallbackBpm;
    }

    this.source = "manual";
    this.epochMs = now;
    this.epochBeatNumber = 1;
    this.epochSet = true;
    this.lastTotalBeats = 0;
    this.downbeatLatch = true;
    this.manualTapComplete = this.clockBpm > 0;
    this.audioAlignStreak = 0;
    this.barSampleSum = { bass: 0, mid: 0, centroid: 0, n: 0 };
    this.recentBars = [];
  }

  /** T — align current instant to a beat; learn BPM from tap spacing. */
  hintBeat(now: number): void {
    const prevTap = this.lastTapMs;
    this.recordTap(now);

    if (this.tapTimes.length >= 2) {
      const bpm = this.medianTapBpm();
      if (bpm > 0) this.clockBpm = bpm;
    }

    this.source = "manual";
    const periodMs = this.clockBpm > 0 ? 60000 / this.clockBpm : 0;

    if (!this.epochSet) {
      this.epochMs = now;
      this.epochBeatNumber = 1;
      this.epochSet = true;
    } else if (
      periodMs > 0 &&
      ((prevTap > 0 && now - prevTap <= periodMs * 1.6) ||
        (now - this.epochMs > 0 && now - this.epochMs <= periodMs * 1.6))
    ) {
      this.epochBeatNumber += 1;
      this.epochMs = now;
    } else if (periodMs > 0) {
      const elapsed = Math.max(0, now - this.epochMs);
      const beatFloat = this.epochBeatNumber - 1 + elapsed / periodMs;
      this.epochBeatNumber = Math.max(1, Math.floor(beatFloat + 0.5));
      this.epochMs = now;
    } else {
      this.epochMs = now;
    }

    this.lastTotalBeats = Math.max(0, this.epochBeatNumber - 1);
    this.manualTapComplete = this.clockBpm > 0;
    this.audioAlignStreak = 0;
  }

  tick(input: SongClockTickInput): BarTiming {
    const {
      now,
      estimatedBpm,
      bpmConfidence,
      bpmLocked,
      audioBeat = false,
      onsetStrength = 0,
      bass = 0,
      mid = 0,
      centroid = 0,
    } = input;

    if (this.source === "manual") {
      return this.tickManual(now, bpmLocked, {
        estimatedBpm,
        bpmConfidence,
        audioBeat,
        onsetStrength,
        bass,
        mid,
        centroid,
      });
    }

    const bpmValid =
      estimatedBpm >= AUTO_BPM_MIN &&
      estimatedBpm <= AUTO_BPM_MAX &&
      (bpmLocked || bpmConfidence > AUTO_CONFIDENCE_THRESHOLD);

    if (bpmValid) {
      if (this.source === "idle") {
        this.autoConfidenceStreak += 1;
        if (this.autoConfidenceStreak >= 4 || bpmLocked) {
          this.source = "auto";
          this.clockBpm = estimatedBpm;
          this.epochMs = now;
          this.epochBeatNumber = 1;
          this.epochSet = true;
          this.lastTotalBeats = 0;
        }
      } else if (this.source === "auto") {
        if (!bpmLocked) {
          this.clockBpm = this.clockBpm * 0.97 + estimatedBpm * 0.03;
        } else {
          this.clockBpm = estimatedBpm;
        }
      }
    } else {
      this.autoConfidenceStreak = 0;
      if (this.source === "auto" && !bpmLocked) {
        this.source = "idle";
        this.clockBpm = 0;
        return { ...EMPTY_BAR_TIMING, bpmLocked };
      }
    }

    if (this.source === "auto" && this.clockBpm > 0) {
      return this.tickRunning(now, "auto", bpmLocked, {
        audioBeat,
        onsetStrength,
        bass,
        mid,
        centroid,
      });
    }

    return { ...EMPTY_BAR_TIMING, bpmLocked };
  }

  private tickManual(
    now: number,
    _bpmLocked: boolean,
    audio: {
      estimatedBpm: number;
      bpmConfidence: number;
      audioBeat: boolean;
      onsetStrength: number;
      bass: number;
      mid: number;
      centroid: number;
    },
  ): BarTiming {
    if (this.manualTapComplete && this.clockBpm > 0) {
      this.applyManualAudioAssist(now, audio);
    }

    if (this.clockBpm <= 0) {
      const beatInPhrase = ((this.epochBeatNumber - 1) % BEATS_PER_PHRASE) + 1;
      const beatInBar = ((beatInPhrase - 1) % BEATS_PER_BAR) + 1;
      const barInPhrase = Math.floor((beatInPhrase - 1) / BEATS_PER_BAR) + 1;
      const latch = this.downbeatLatch;
      const timing: BarTiming = {
        source: "manual",
        synced: this.epochSet && latch,
        bpmLocked: true,
        clockBpm: 0,
        beatInBar,
        beatInPhrase,
        barInPhrase,
        beatPhase: 0,
        barPhase: (beatInBar - 1) / BEATS_PER_BAR,
        phrasePhase: (beatInPhrase - 1) / BEATS_PER_PHRASE,
        totalBeats: this.epochBeatNumber,
        beatJustTicked: latch,
        barJustStarted: latch && beatInBar === 1,
        phraseJustStarted: latch && beatInPhrase === 1,
      };
      this.downbeatLatch = false;
      return timing;
    }

    return this.tickRunning(now, "manual", true, audio);
  }

  private applyManualAudioAssist(
    now: number,
    audio: {
      estimatedBpm: number;
      bpmConfidence: number;
      audioBeat: boolean;
      onsetStrength: number;
    },
  ): void {
    if (!audio.audioBeat || audio.bpmConfidence < MANUAL_AUDIO_CONFIDENCE) return;
    if (audio.onsetStrength < MANUAL_AUDIO_ONSET) return;
    if (now - this.lastAudioBeatMs < 120) return;
    this.lastAudioBeatMs = now;

    const periodMs = 60000 / this.clockBpm;
    const elapsed = Math.max(0, now - this.epochMs);
    const beatFloat = this.epochBeatNumber - 1 + elapsed / periodMs;
    const nearestBeat = Math.round(beatFloat);
    const expectedMs = this.epochMs + (nearestBeat - (this.epochBeatNumber - 1)) * periodMs;
    const deltaMs = now - expectedMs;

    if (Math.abs(deltaMs) <= periodMs * MANUAL_ALIGN_WINDOW) {
      this.epochMs += deltaMs * 0.35;
      if (isValidBpm(audio.estimatedBpm)) {
        this.clockBpm = this.clockBpm * 0.98 + audio.estimatedBpm * 0.02;
      }
      this.audioAlignStreak += 1;
      if (this.audioAlignStreak >= MANUAL_RELEASE_STREAK && audio.bpmConfidence > 0.68) {
        this.source = "auto";
        this.manualTapComplete = false;
        this.audioAlignStreak = 0;
      }
    } else {
      this.audioAlignStreak = Math.max(0, this.audioAlignStreak - 1);
    }
  }

  private tickRunning(
    now: number,
    source: ClockSource,
    bpmLocked: boolean,
    audio: {
      audioBeat: boolean;
      onsetStrength: number;
      bass: number;
      mid: number;
      centroid: number;
    } = { audioBeat: false, onsetStrength: 0, bass: 0, mid: 0, centroid: 0 },
  ): BarTiming {
    const periodMs = 60000 / this.clockBpm;
    const elapsed = Math.max(0, now - this.epochMs);
    const beatFloat = this.epochBeatNumber - 1 + elapsed / periodMs;
    const latch = this.downbeatLatch;

    let timing = timingFromBeatFloat(
      beatFloat,
      source,
      this.clockBpm,
      bpmLocked,
      this.lastTotalBeats,
      latch,
    );

    let phraseChangeDetected = false;
    if (this.maybeDetectPhraseChange(timing, now, audio)) {
      phraseChangeDetected = true;
      const elapsed2 = Math.max(0, now - this.epochMs);
      const beatFloat2 = this.epochBeatNumber - 1 + elapsed2 / periodMs;
      timing = timingFromBeatFloat(
        beatFloat2,
        source,
        this.clockBpm,
        bpmLocked,
        this.lastTotalBeats,
        true,
      );
    }

    if (audio.bass + audio.mid > 0) {
      this.barSampleSum.bass += audio.bass;
      this.barSampleSum.mid += audio.mid;
      this.barSampleSum.centroid += audio.centroid;
      this.barSampleSum.n += 1;
    }

    this.lastTotalBeats = timing.totalBeats;
    this.downbeatLatch = false;
    return phraseChangeDetected ? { ...timing, phraseChangeDetected } : timing;
  }

  /** At bar line: compare the bar that just ended to recent bars; realign on strong change. */
  private maybeDetectPhraseChange(
    timing: BarTiming,
    now: number,
    audio: { audioBeat: boolean; onsetStrength: number },
  ): boolean {
    if (!timing.beatJustTicked || timing.beatInBar !== 1 || this.barSampleSum.n === 0) {
      return false;
    }

    const completed: BarSignature = {
      bass: this.barSampleSum.bass / this.barSampleSum.n,
      mid: this.barSampleSum.mid / this.barSampleSum.n,
      centroid: this.barSampleSum.centroid / this.barSampleSum.n,
    };

    let change = 0;
    if (this.recentBars.length >= 2) {
      const baseline = this.recentBars.reduce(
        (acc, bar) => ({
          bass: acc.bass + bar.bass,
          mid: acc.mid + bar.mid,
          centroid: acc.centroid + bar.centroid,
        }),
        { bass: 0, mid: 0, centroid: 0 },
      );
      const mean: BarSignature = {
        bass: baseline.bass / this.recentBars.length,
        mid: baseline.mid / this.recentBars.length,
        centroid: baseline.centroid / this.recentBars.length,
      };
      change = signatureDistance(completed, mean);
    }

    this.recentBars.push(completed);
    if (this.recentBars.length > 4) this.recentBars.shift();
    this.barSampleSum = { bass: 0, mid: 0, centroid: 0, n: 0 };

    if (
      this.recentBars.length >= 4 &&
      timing.totalBeats > BEATS_PER_BAR &&
      change >= PHRASE_CHANGE_THRESHOLD &&
      audio.audioBeat &&
      audio.onsetStrength >= PHRASE_ONSET_MIN
    ) {
      this.alignPhraseDownbeat(now);
      return true;
    }
    return false;
  }

  private alignPhraseDownbeat(now: number): void {
    this.epochMs = now;
    this.epochBeatNumber = 1;
    this.downbeatLatch = true;
    this.lastTotalBeats = 0;
    this.recentBars = [];
  }

  private recordTap(now: number): void {
    if (this.lastTapMs > 0 && now - this.lastTapMs > TAP_TIMEOUT_MS) {
      this.tapTimes = [];
      this.clockBpm = 0;
      this.manualTapComplete = false;
    }
    this.tapTimes.push(now);
    if (this.tapTimes.length > 8) this.tapTimes.shift();
    this.lastTapMs = now;
  }

  private medianTapBpm(): number {
    if (this.tapTimes.length < 2) return 0;
    const intervals: number[] = [];
    for (let i = 1; i < this.tapTimes.length; i++) {
      intervals.push(this.tapTimes[i]! - this.tapTimes[i - 1]!);
    }
    intervals.sort((a, b) => a - b);
    const median = intervals[Math.floor(intervals.length / 2)]!;
    if (median < MIN_TAP_INTERVAL_MS || median > MAX_TAP_INTERVAL_MS) return 0;
    return clampBpm(60000 / median);
  }
}

export function formatBarTiming(t: BarTiming): string {
  return `${t.beatInPhrase}/${BEATS_PER_PHRASE}`;
}

/** @deprecated Use SongClock */
export { SongClock as BarClock };
