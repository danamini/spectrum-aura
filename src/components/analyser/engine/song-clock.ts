/**
 * Authoritative musical clock for bar/phrase grid, view cycling, and visual beat phase.
 *
 * Manual taps (T / Shift+T) own epoch and BPM once established.
 * Audio analysis only estimates tempo before manual lock; it never advances the grid.
 */

export const BEATS_PER_BAR = 4;
export const BEATS_PER_PHRASE = 16;
export const BARS_PER_PHRASE = BEATS_PER_PHRASE / BEATS_PER_BAR;

export const TAP_TIMEOUT_MS = 2000;
const MIN_TAP_INTERVAL_MS = 250;
const MAX_TAP_INTERVAL_MS = 1200;
const AUTO_CONFIDENCE_THRESHOLD = 0.62;
const AUTO_BPM_MIN = 65;
const AUTO_BPM_MAX = 195;

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
};

function clampBpm(bpm: number): number {
  let v = bpm;
  if (v < 80) v *= 2;
  if (v > 180) v *= 0.5;
  return Math.max(60, Math.min(200, v));
}

function timingFromBeatFloat(
  beatFloat: number,
  source: ClockSource,
  clockBpm: number,
  bpmLocked: boolean,
  prevTotalBeats: number,
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
  const beatJustTicked = totalBeats > prevTotalBeats;
  const barJustStarted = beatJustTicked && beatInBar === 1;
  const phraseJustStarted = beatJustTicked && beatInPhrase === 1 && totalBeats > 1;

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
  }

  getSource(): ClockSource {
    return this.source;
  }

  getClockBpm(): number {
    return this.clockBpm;
  }

  /** Shift+T — align to beat 1 of bar 1 (phrase start). */
  hintDownbeat(now: number): void {
    this.recordTap(now);
    if (this.tapTimes.length >= 2) {
      const bpm = this.medianTapBpm();
      if (bpm > 0) this.clockBpm = bpm;
    }
    this.source = "manual";
    this.epochMs = now;
    this.epochBeatNumber = 1;
    this.epochSet = true;
    this.lastTotalBeats = 0;
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
  }

  tick(input: SongClockTickInput): BarTiming {
    const { now, estimatedBpm, bpmConfidence, bpmLocked } = input;

    if (this.source === "manual") {
      return this.tickManual(now, bpmLocked);
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
      return this.tickRunning(now, "auto", bpmLocked);
    }

    return { ...EMPTY_BAR_TIMING, bpmLocked };
  }

  private tickManual(now: number, _bpmLocked: boolean): BarTiming {
    if (this.clockBpm <= 0) {
      const beatInPhrase = ((this.epochBeatNumber - 1) % BEATS_PER_PHRASE) + 1;
      const beatInBar = ((beatInPhrase - 1) % BEATS_PER_BAR) + 1;
      const barInPhrase = Math.floor((beatInPhrase - 1) / BEATS_PER_BAR) + 1;
      return {
        source: "manual",
        synced: false,
        bpmLocked: true,
        clockBpm: 0,
        beatInBar,
        beatInPhrase,
        barInPhrase,
        beatPhase: 0,
        barPhase: (beatInBar - 1) / BEATS_PER_BAR,
        phrasePhase: (beatInPhrase - 1) / BEATS_PER_PHRASE,
        totalBeats: this.epochBeatNumber,
        beatJustTicked: false,
        barJustStarted: false,
        phraseJustStarted: false,
      };
    }
    return this.tickRunning(now, "manual", true);
  }

  private tickRunning(now: number, source: ClockSource, bpmLocked: boolean): BarTiming {
    const periodMs = 60000 / this.clockBpm;
    const elapsed = Math.max(0, now - this.epochMs);
    const beatFloat = this.epochBeatNumber - 1 + elapsed / periodMs;
    const timing = timingFromBeatFloat(
      beatFloat,
      source,
      this.clockBpm,
      bpmLocked,
      this.lastTotalBeats,
    );
    this.lastTotalBeats = timing.totalBeats;
    return timing;
  }

  private recordTap(now: number): void {
    if (this.lastTapMs > 0 && now - this.lastTapMs > TAP_TIMEOUT_MS) {
      this.tapTimes = [];
      this.clockBpm = 0;
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
