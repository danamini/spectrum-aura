import type { MidiClockFrame } from "./midi-clock";

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
/**
 * Auto-mode phase lock. Each confident onset near a grid beat pulls the grid
 * a fraction of the way onto it and corrects the tempo, so the grid sits on
 * the beats the listener hears instead of wherever the tempo happened to lock.
 */
const AUTO_LOCK_ONSET_MIN = 0.06;
/** Onsets further than this from a grid beat (in beats) are not beats. */
const AUTO_LOCK_WINDOW = 0.25;
const AUTO_LOCK_PHASE_GAIN = 0.22;
/** Tempo correction per beat of phase error — the integral term that removes
 * the steady lag a small tempo error would otherwise leave. */
const AUTO_LOCK_TEMPO_GAIN = 0.03;
/** Aligned onsets in a row before the clock trusts its own tempo over the
 * detector's. From then on it is a flywheel: it holds tempo through passages
 * with no beats (breakdowns), where the detector's estimate wanders. */
const AUTO_LOCK_CONFIRM_STREAK = 6;
/** Onsets in a row that fit neither the beat nor the off-beat: the tempo has
 * really changed, so hand tempo back to the detector and re-anchor. */
const AUTO_LOCK_LOST_STREAK = 8;
/** A confirmed clock keeps running this long after the detector loses the
 * tempo with no onset to confirm it, before giving up. */
const AUTO_COAST_MS = 12000;
/** A confirmed clock adopts the detector's tempo when it settles on double or
 * half the clock's for this long — the detector correcting its own octave. */
const AUTO_OCTAVE_SWITCH_MS = 1500;
const AUTO_OCTAVE_TOLERANCE = 0.05;
/** This many onsets in a row landing between grid beats means the grid
 * locked onto the off-beats; shift it half a beat. */
const AUTO_LOCK_OFFBEAT_STREAK = 6;
const AUTO_LOCK_OFFBEAT_WINDOW = 0.12;

/**
 * Section-start ("drop") detection. A beat whose kick-band level is clearly
 * above every one of the previous beats is the first beat of a new section,
 * and its kick becomes bar 1, beat 1 of the phrase.
 *
 * Levels are on the analyser's decibel scale (0–1 spans 70 dB), so the test
 * is a difference, not a ratio: 0.04 is about 3 dB. Calibrated on recorded
 * tracks, where the kick band steps by 0.1–0.25 at a section start while the
 * wide "bass" band (0–1.9 kHz) moves by 0.03 or less.
 *
 * The comparison is against the loudest recent beat, not the average: in a
 * steady groove the kick beats already sit above the average of kick and
 * snare beats, and an average-based test fired on them.
 */
const SECTION_HISTORY_BEATS = 8;
const SECTION_MIN_HISTORY_BEATS = 6;
const SECTION_KICK_RISE = 0.04;
/** A single onset this far above every recent beat's peak is the hit itself. */
const SECTION_ONSET_RISE = 0.04;
const SECTION_COOLDOWN_BEATS = 8;
/** After this long without a confirmed alignment to the tapped tempo, drop the
 * manual lock and let auto-detection try to reacquire from scratch. Covers both
 * "audio went silent" and "audio kept playing but the tempo diverged" — either
 * way, alignment checks would otherwise never succeed again on their own. */
export const MANUAL_REACQUIRE_AFTER_MS = 6000;

export type ClockSource = "idle" | "auto" | "manual" | "external";

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
  external?: MidiClockFrame;
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
  /** Kick-band level (`AudioBands.kick`); falls back to `bass` when absent. */
  kick?: number;
};

function clampBpm(bpm: number): number {
  let v = bpm;
  if (v < 80) v *= 2;
  if (v > 180) v *= 0.5;
  return Math.max(60, Math.min(200, v));
}

function isValidBpm(bpm: number): boolean {
  return bpm >= AUTO_BPM_MIN && bpm <= AUTO_BPM_MAX;
}

const AUTO_BLEND_BASE_ALPHA = 0.03;
const AUTO_BLEND_FAST_ALPHA = 0.25;
const AUTO_BLEND_FAST_WINDOW_FRAMES = 30;

/**
 * Blend weight for the not-yet-locked auto-mode BPM estimate: converges faster
 * right after entering auto mode (when clockBpm hasn't settled yet), easing down
 * to the steady-state rate as the estimate stabilizes. `framesSinceAutoEntry` is
 * 0 on the frame auto mode is entered.
 */
export function autoBpmBlendAlpha(framesSinceAutoEntry: number): number {
  if (framesSinceAutoEntry >= AUTO_BLEND_FAST_WINDOW_FRAMES) return AUTO_BLEND_BASE_ALPHA;
  const t = Math.max(0, framesSinceAutoEntry) / AUTO_BLEND_FAST_WINDOW_FRAMES;
  return AUTO_BLEND_FAST_ALPHA + (AUTO_BLEND_BASE_ALPHA - AUTO_BLEND_FAST_ALPHA) * t;
}

function timingFromBeatFloat(
  beatFloat: number,
  source: ClockSource,
  clockBpm: number,
  bpmLocked: boolean,
  prevTotalBeats: number,
  downbeatLatch: boolean,
): BarTiming {
  const phraseBeatFloat = ((beatFloat % BEATS_PER_PHRASE) + BEATS_PER_PHRASE) % BEATS_PER_PHRASE;
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

export class SongClock {
  private source: ClockSource = "idle";
  private externalRevision = -1;
  private externalBeat = 0;
  private clockBpm = 0;
  private epochMs = 0;
  private epochBeatNumber = 1;
  private epochSet = false;
  private lastTotalBeats = 0;
  private tapTimes: number[] = [];
  private lastTapMs = 0;
  private autoConfidenceStreak = 0;
  private framesSinceAutoEntry = 0;
  private manualTapComplete = false;
  private downbeatLatch = false;
  private audioAlignStreak = 0;
  private lastAudioBeatMs = 0;
  private lastAlignedAt = 0;
  private manualReleasePending = false;
  private beatSum = { kick: 0, peak: 0, n: 0, loudOnsetMs: -1 };
  /** First loud onset of the beat before the one being summed, or -1. */
  private prevBeatLoudOnsetMs = -1;
  private beatKicks: number[] = [];
  private beatPeaks: number[] = [];
  private beatsSinceSection = SECTION_COOLDOWN_BEATS;
  /** Last confident onset in any mode — used to start the auto grid on a beat. */
  private lastOnsetMs = -Infinity;
  private offbeatStreak = 0;
  private alignedStreak = 0;
  private lostStreak = 0;
  private autoConfirmed = false;
  private lastAlignedOnsetMs = 0;
  private octaveSinceMs = -1;

  /**
   * Follows the detector to double or half tempo. The epoch is left where it
   * is, so a phrase start stays at the same moment in time; only the number
   * of beats counted since then changes.
   */
  private followOctave(estimatedBpm: number, now: number): void {
    const ratio = estimatedBpm / this.clockBpm;
    const factor =
      Math.abs(ratio - 2) <= 2 * AUTO_OCTAVE_TOLERANCE
        ? 2
        : Math.abs(ratio - 0.5) <= 0.5 * AUTO_OCTAVE_TOLERANCE
          ? 0.5
          : 0;
    if (factor === 0) {
      this.octaveSinceMs = -1;
      return;
    }
    if (this.octaveSinceMs < 0) this.octaveSinceMs = now;
    if (now - this.octaveSinceMs < AUTO_OCTAVE_SWITCH_MS) return;
    this.octaveSinceMs = -1;
    this.clockBpm *= factor;
    const beatFloat =
      this.epochBeatNumber - 1 + Math.max(0, now - this.epochMs) / (60000 / this.clockBpm);
    this.lastTotalBeats = Math.floor(beatFloat) + 1;
    // The per-beat level history stays: levels are averages, so they mean the
    // same at either beat length, and discarding them here blinded section
    // detection for six beats — which is exactly when a drop tends to land.
  }

  private resetAutoLock(now: number): void {
    this.octaveSinceMs = -1;
    this.offbeatStreak = 0;
    this.alignedStreak = 0;
    this.lostStreak = 0;
    this.autoConfirmed = false;
    this.lastAlignedOnsetMs = now;
  }

  private resetSectionHistory(): void {
    this.beatSum = { kick: 0, peak: 0, n: 0, loudOnsetMs: -1 };
    this.prevBeatLoudOnsetMs = -1;
    this.beatKicks = [];
    this.beatPeaks = [];
    this.beatsSinceSection = SECTION_COOLDOWN_BEATS;
  }

  /**
   * Changes the tempo without moving the beat position: the epoch is
   * re-anchored so the current beat count is the same before and after.
   * Without this a tempo correction slid the whole grid, by more the longer
   * the clock had been running.
   */
  private setClockBpm(bpm: number, now: number): void {
    if (bpm <= 0 || bpm === this.clockBpm) return;
    if (this.clockBpm > 0 && this.epochSet) {
      const beatsSinceEpoch = Math.max(0, now - this.epochMs) / (60000 / this.clockBpm);
      this.epochMs = now - beatsSinceEpoch * (60000 / bpm);
    }
    this.clockBpm = bpm;
  }

  reset(): void {
    this.externalRevision = -1;
    this.externalBeat = 0;
    this.source = "idle";
    this.clockBpm = 0;
    this.epochMs = 0;
    this.epochBeatNumber = 1;
    this.epochSet = false;
    this.lastTotalBeats = 0;
    this.tapTimes = [];
    this.lastTapMs = 0;
    this.autoConfidenceStreak = 0;
    this.framesSinceAutoEntry = 0;
    this.manualTapComplete = false;
    this.downbeatLatch = false;
    this.audioAlignStreak = 0;
    this.lastAudioBeatMs = 0;
    this.lastAlignedAt = 0;
    this.manualReleasePending = false;
    this.resetSectionHistory();
    this.lastOnsetMs = -Infinity;
    this.resetAutoLock(0);
  }

  /**
   * True once, the frame after a stale manual lock was dropped back to idle —
   * lets the caller release the underlying BPMDetector's tap-lock too (SongClock
   * doesn't hold a reference to it), so fresh auto-detection can actually
   * contribute new estimates again. Edge-triggered: resets to false once read.
   */
  consumeManualReleaseSignal(): boolean {
    if (!this.manualReleasePending) return false;
    this.manualReleasePending = false;
    return true;
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
    this.lastAlignedAt = now;
    this.resetSectionHistory();
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
    this.lastAlignedAt = now;
  }

  tick(input: SongClockTickInput): BarTiming {
    if (input.external?.enabled) return this.tickExternal(input.now, input.external);
    if (this.source === "external") this.reset();
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
    const kick = input.kick ?? bass;

    if (audioBeat && onsetStrength >= AUTO_LOCK_ONSET_MIN) this.lastOnsetMs = now;

    if (this.source === "manual") {
      return this.tickManual(now, bpmLocked, {
        estimatedBpm,
        bpmConfidence,
        audioBeat,
        onsetStrength,
        bass,
        mid,
        centroid,
        kick,
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
          // Start counting from the last beat actually heard, not from the
          // moment the tempo estimate happened to settle.
          const periodMs = 60000 / estimatedBpm;
          const sinceOnset = now - this.lastOnsetMs;
          this.epochMs = sinceOnset >= 0 && sinceOnset < periodMs ? this.lastOnsetMs : now;
          this.epochBeatNumber = 1;
          this.epochSet = true;
          this.lastTotalBeats = 0;
          this.framesSinceAutoEntry = 0;
          this.resetAutoLock(now);
          this.resetSectionHistory();
        }
      } else if (this.source === "auto" && !this.autoConfirmed) {
        // Until onsets have confirmed the grid, tempo follows the detector.
        // After that the phase lock owns it (see applyAutoPhaseLock).
        if (!bpmLocked) {
          const alpha = autoBpmBlendAlpha(this.framesSinceAutoEntry);
          this.setClockBpm(this.clockBpm * (1 - alpha) + estimatedBpm * alpha, now);
          this.framesSinceAutoEntry += 1;
        } else {
          this.setClockBpm(estimatedBpm, now);
        }
      } else if (this.source === "auto" && bpmLocked) {
        this.followOctave(estimatedBpm, now);
      }
    } else {
      this.autoConfidenceStreak = 0;
      const coasting = this.autoConfirmed && now - this.lastAlignedOnsetMs < AUTO_COAST_MS;
      if (this.source === "auto" && !bpmLocked && !coasting) {
        this.source = "idle";
        this.clockBpm = 0;
        return { ...EMPTY_BAR_TIMING, bpmLocked };
      }
    }

    if (this.source === "auto" && this.clockBpm > 0) {
      return this.tickRunning(now, "auto", bpmLocked, {
        estimatedBpm: bpmValid ? estimatedBpm : 0,
        audioBeat,
        onsetStrength,
        bass,
        mid,
        centroid,
        kick,
      });
    }

    return { ...EMPTY_BAR_TIMING, bpmLocked };
  }

  private tickExternal(now: number, external: MidiClockFrame): BarTiming {
    const changed = this.source !== "external" || this.externalRevision !== external.revision;
    this.source = "external";
    this.clockBpm = external.bpm;
    this.externalRevision = external.revision;
    // Interpolate only within the next MIDI pulse. Missing pulses cannot make
    // the grid run away or manufacture phrase boundaries.
    const fraction =
      external.running && external.bpm > 0
        ? Math.min(1 / 24 - 1e-7, (Math.max(0, now - external.timestamp) * external.bpm) / 60000)
        : 0;
    const requestedBeat = external.beat + fraction;
    this.externalBeat = changed ? requestedBeat : Math.max(this.externalBeat, requestedBeat);
    const boundary = changed && external.running && external.beat % 1 === 0;
    if (changed) this.lastTotalBeats = Math.floor(this.externalBeat) + 1;
    const timing = timingFromBeatFloat(
      this.externalBeat,
      "external",
      this.clockBpm,
      external.fresh && external.bpm > 0,
      this.lastTotalBeats,
      boundary,
    );
    timing.synced = external.running && external.bpm > 0;
    if (!external.running) {
      timing.beatJustTicked = false;
      timing.barJustStarted = false;
      timing.phraseJustStarted = false;
    }
    this.lastTotalBeats = timing.totalBeats;
    return timing;
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
      kick?: number;
    },
  ): BarTiming {
    if (
      this.manualTapComplete &&
      this.clockBpm > 0 &&
      now - this.lastAlignedAt > MANUAL_REACQUIRE_AFTER_MS
    ) {
      // Nothing has confirmed this tempo in a while — could be silence, could be
      // the track changing tempo. Either way, alignment checks against the stale
      // tapped value will never succeed on their own, so drop back to idle and
      // let normal auto-detection try to reacquire from scratch.
      this.source = "idle";
      this.manualTapComplete = false;
      this.audioAlignStreak = 0;
      this.manualReleasePending = true;
      return { ...EMPTY_BAR_TIMING, bpmLocked: false };
    }

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
      this.lastAlignedAt = now;
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
      estimatedBpm?: number;
      audioBeat: boolean;
      onsetStrength: number;
      bass: number;
      mid: number;
      centroid: number;
      kick?: number;
    } = { audioBeat: false, onsetStrength: 0, bass: 0, mid: 0, centroid: 0 },
  ): BarTiming {
    if (source === "auto") this.applyAutoPhaseLock(now, audio);
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
    if (this.detectSectionStart(timing, now)) {
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

    const kickLevel = audio.kick ?? audio.bass;
    if (audio.bass + audio.mid > 0) {
      this.beatSum.kick += kickLevel;
      this.beatSum.peak = Math.max(this.beatSum.peak, kickLevel);
      this.beatSum.n += 1;
    }
    // Remember where in the beat a section-sized hit landed, so a detected
    // section can be anchored to the kick itself rather than to a grid line.
    if (
      this.beatSum.loudOnsetMs < 0 &&
      audio.audioBeat &&
      this.beatPeaks.length >= SECTION_MIN_HISTORY_BEATS &&
      kickLevel >= Math.max(...this.beatPeaks) + SECTION_ONSET_RISE
    ) {
      this.beatSum.loudOnsetMs = now;
    }

    // A phase nudge can step the grid back across a boundary it has just
    // crossed; holding the count monotonic stops that beat ticking twice.
    this.lastTotalBeats =
      phraseChangeDetected || latch
        ? timing.totalBeats
        : Math.max(this.lastTotalBeats, timing.totalBeats);
    this.downbeatLatch = false;
    return phraseChangeDetected ? { ...timing, phraseChangeDetected } : timing;
  }

  /** Pulls the auto grid onto confident onsets and corrects its tempo — see AUTO_LOCK_*. */
  private applyAutoPhaseLock(
    now: number,
    audio: { audioBeat: boolean; onsetStrength: number; estimatedBpm?: number },
  ): void {
    if (!audio.audioBeat || audio.onsetStrength < AUTO_LOCK_ONSET_MIN || this.clockBpm <= 0) return;
    const periodMs = 60000 / this.clockBpm;
    const beatFloat = (now - this.epochMs) / periodMs;
    // Positive: the onset came after the grid beat, so the grid is early.
    const error = beatFloat - Math.round(beatFloat);
    if (Math.abs(error) <= AUTO_LOCK_WINDOW) {
      this.epochMs += error * periodMs * AUTO_LOCK_PHASE_GAIN;
      this.alignedStreak += 1;
      this.lostStreak = 0;
      this.offbeatStreak = 0;
      this.lastAlignedOnsetMs = now;
      if (this.alignedStreak >= AUTO_LOCK_CONFIRM_STREAK) this.autoConfirmed = true;
      if (this.autoConfirmed) {
        // Onsets arriving late mean the grid runs fast: slow the tempo.
        const corrected = this.clockBpm * (1 - error * AUTO_LOCK_TEMPO_GAIN);
        this.setClockBpm(Math.max(AUTO_BPM_MIN, Math.min(AUTO_BPM_MAX, corrected)), now);
      }
    } else if (Math.abs(Math.abs(error) - 0.5) <= AUTO_LOCK_OFFBEAT_WINDOW) {
      this.offbeatStreak += 1;
      if (this.offbeatStreak >= AUTO_LOCK_OFFBEAT_STREAK) {
        this.epochMs += periodMs / 2;
        this.offbeatStreak = 0;
      }
    } else {
      this.offbeatStreak = Math.max(0, this.offbeatStreak - 1);
      this.alignedStreak = Math.max(0, this.alignedStreak - 1);
      this.lostStreak += 1;
      if (this.autoConfirmed && this.lostStreak >= AUTO_LOCK_LOST_STREAK) {
        // The music no longer fits this grid at all: take the detector's
        // tempo again and put this onset on a beat, keeping the beat count.
        this.resetAutoLock(now);
        if (audio.estimatedBpm && isValidBpm(audio.estimatedBpm)) {
          this.setClockBpm(audio.estimatedBpm, now);
        }
        const period = 60000 / this.clockBpm;
        const position = (now - this.epochMs) / period;
        this.epochMs += (position - Math.round(position)) * period;
      }
    }
  }

  /**
   * At each beat line, closes the beat that just ended and tests it against
   * the beats before it. A beat whose kick band is above all of them marks the start of a
   * new section, and the grid is re-anchored so that beat's kick is bar 1,
   * beat 1.
   *
   * Working per beat rather than per bar is what puts bar 1 on the drop: the
   * earlier per-bar comparison noticed a change a full bar after it happened
   * and anchored the phrase there, one bar late.
   */
  private detectSectionStart(timing: BarTiming, now: number): boolean {
    if (!timing.beatJustTicked || this.beatSum.n === 0) return false;
    const kick = this.beatSum.kick / this.beatSum.n;
    const peak = this.beatSum.peak;
    const loudOnsetMs = this.beatSum.loudOnsetMs;
    const earlierLoudOnsetMs = this.prevBeatLoudOnsetMs;
    this.beatSum = { kick: 0, peak: 0, n: 0, loudOnsetMs: -1 };
    this.prevBeatLoudOnsetMs = loudOnsetMs;

    const started =
      this.beatKicks.length >= SECTION_MIN_HISTORY_BEATS &&
      this.beatsSinceSection >= SECTION_COOLDOWN_BEATS &&
      kick >= Math.max(...this.beatKicks) + SECTION_KICK_RISE;
    this.beatKicks.push(kick);
    this.beatPeaks.push(peak);
    if (this.beatKicks.length > SECTION_HISTORY_BEATS) {
      this.beatKicks.shift();
      this.beatPeaks.shift();
    }
    this.beatsSinceSection += 1;
    if (!started) return false;

    // Beat 1 is the hit itself. If the grid had drifted, the hit may have
    // landed late in the beat before this one; prefer that earlier onset.
    const periodMs = 60000 / this.clockBpm;
    const beatFloat = this.epochBeatNumber - 1 + Math.max(0, now - this.epochMs) / periodMs;
    const beatStartMs = now - (beatFloat - Math.floor(beatFloat)) * periodMs - periodMs;
    const recent = (ms: number) => ms >= 0 && now - ms < periodMs * 2.2;
    const anchorMs = recent(earlierLoudOnsetMs)
      ? earlierLoudOnsetMs
      : recent(loudOnsetMs)
        ? loudOnsetMs
        : beatStartMs;
    this.epochMs = anchorMs;
    this.epochBeatNumber = 1;
    this.downbeatLatch = true;
    this.lastTotalBeats = Math.floor(Math.max(0, now - anchorMs) / periodMs);
    this.beatsSinceSection = 0;
    this.prevBeatLoudOnsetMs = -1;
    return true;
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
