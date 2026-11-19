import { BeatMatcher } from "../../beat-matcher";
import { BPMDetector } from "../../bpm-detector";
import { SongClock, type BarTiming } from "../../song-clock";

/**
 * A simulated track played through the same chain the app runs each frame
 * (BeatMatcher → BPMDetector → SongClock), with known beat times and a known
 * arrangement, so tempo error, beat alignment and section detection can be
 * measured against ground truth.
 */

export function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Onset = { t: number; bass: number; mid: number; high: number; decayMs: number };
export type Section = "intro" | "full" | "breakdown";

export type TrackSpec = {
  bpm: number;
  seed: number;
  /** Section for each bar, in order. */
  bars: Section[];
  /** Start of beat 1, so the grid is not accidentally aligned to t = 0. */
  offsetMs: number;
  volume?: number;
};

export type Track = {
  spec: TrackSpec;
  beatMs: number;
  beatTimes: number[];
  totalMs: number;
  bandsAt(t: number): {
    bass: number;
    mid: number;
    high: number;
    kick: number;
    centroid: number;
  };
  sectionAtBar(bar: number): Section;
};

export function buildTrack(spec: TrackSpec): Track {
  const rand = mulberry32(spec.seed);
  const beatMs = 60000 / spec.bpm;
  const onsets: Onset[] = [];
  const beatTimes: number[] = [];
  const totalBeats = spec.bars.length * 4;
  for (let beat = 0; beat < totalBeats; beat++) {
    const section = spec.bars[Math.floor(beat / 4)]!;
    const jitter = (rand() - 0.5) * beatMs * 0.03;
    const bt = spec.offsetMs + beat * beatMs + jitter;
    beatTimes.push(spec.offsetMs + beat * beatMs);
    const inBar = beat % 4;
    if (section === "full") {
      // Four-on-the-floor kick with a snare on 2 and 4.
      onsets.push({ t: bt, bass: 0.3 + rand() * 0.06, mid: 0.05, high: 0.03, decayMs: 140 });
      if (inBar === 1 || inBar === 3) {
        onsets.push({ t: bt, bass: 0.05, mid: 0.16 + rand() * 0.04, high: 0.08, decayMs: 160 });
      }
    } else if (section === "intro") {
      if (inBar === 0 || inBar === 2) {
        onsets.push({ t: bt, bass: 0.2 + rand() * 0.05, mid: 0.04, high: 0.02, decayMs: 130 });
      }
      if (inBar === 1 || inBar === 3) {
        onsets.push({ t: bt, bass: 0.04, mid: 0.11 + rand() * 0.03, high: 0.06, decayMs: 150 });
      }
    }
    // Hats run through every section, quieter in the breakdown.
    const hat = section === "breakdown" ? 0.03 : 0.05;
    for (const frac of [0, 0.5]) {
      onsets.push({
        t: bt + frac * beatMs + (rand() - 0.5) * 8,
        bass: 0.004,
        mid: 0.01,
        high: hat + rand() * 0.02,
        decayMs: 70,
      });
    }
  }
  const totalMs = spec.offsetMs + totalBeats * beatMs;
  const volume = spec.volume ?? 1;
  const sectionAtBar = (bar: number) =>
    spec.bars[Math.max(0, Math.min(spec.bars.length - 1, bar))]!;
  return {
    spec,
    beatMs,
    beatTimes,
    totalMs,
    sectionAtBar,
    bandsAt(t: number) {
      const bar = Math.floor((t - spec.offsetMs) / (beatMs * 4));
      const section = t < spec.offsetMs ? "intro" : sectionAtBar(bar);
      // Sustained bed: bassline and chords in the full sections, pads alone
      // in the breakdown.
      const bed = section === "full" ? 1 : section === "intro" ? 0.6 : 0.45;
      let bass = (0.05 + 0.02 * Math.sin(t * 0.0005 + spec.seed)) * bed;
      let mid = (0.09 + 0.03 * Math.sin(t * 0.0003 + spec.seed * 1.7)) * (0.5 + bed * 0.5);
      let high = 0.04 + 0.01 * Math.sin(t * 0.0007 + spec.seed * 0.6);
      for (const o of onsets) {
        const dt = t - o.t;
        if (dt < 0 || dt > o.decayMs * 4) continue;
        const env = dt < 20 ? dt / 20 : Math.exp(-(dt - 20) / o.decayMs);
        bass += o.bass * env;
        mid += o.mid * env;
        high += o.high * env;
      }
      bass = Math.min(1, bass * volume);
      mid = Math.min(1, mid * volume);
      high = Math.min(1, high * volume);
      const total = bass + mid + high;
      // The analyser reports levels in decibels: 0–1 spans 70 dB, so a tenfold
      // change in amplitude is 0.286. Real kick bands sit around 0.65–0.86.
      const kick = Math.max(0, Math.min(1, 0.85 + 0.286 * Math.log10(Math.max(1e-4, bass) / 0.35)));
      return {
        bass,
        mid,
        high,
        kick,
        centroid: total > 0 ? (mid * 0.4 + high * 0.9) / total : 0,
      };
    },
  };
}

export type SimFrame = {
  t: number;
  timing: BarTiming;
  bpm: number;
  locked: boolean;
  beat: boolean;
  /** Detector's own estimate, before the clock. */
  detectorBpm: number;
  confirmed: boolean;
};

/** Plays `track` at `fps` through the detector chain and returns every frame. */
export function simulate(track: Track, fps = 60): SimFrame[] {
  const matcher = new BeatMatcher();
  const detector = new BPMDetector();
  const clock = new SongClock();
  const frames: SimFrame[] = [];
  let lastBpm = 0;
  let lastConfident = false;
  const step = 1000 / fps;
  for (let t = 0; t <= track.totalMs; t += step) {
    const b = track.bandsAt(t);
    const match = matcher.detect(b.bass, b.mid, b.high, b.centroid, 1.5, t, lastBpm, lastConfident);
    detector.feedBands(
      {
        bass: b.bass,
        mid: b.mid,
        high: b.high,
        bassDelta: match.bassDelta,
        midDelta: match.midDelta,
      },
      t,
    );
    const r = detector.tick(t);
    lastBpm = r.bpm;
    lastConfident = r.bpm > 0 && r.confidence > 0.45;
    const timing = clock.tick({
      now: t,
      estimatedBpm: r.bpm,
      bpmConfidence: r.confidence,
      bpmLocked: r.bpmLocked,
      audioBeat: match.beat,
      onsetStrength: match.onsetStrength,
      bass: b.bass,
      mid: b.mid,
      centroid: b.centroid,
      kick: b.kick,
    });
    frames.push({
      t,
      timing,
      bpm: timing.clockBpm,
      locked: r.bpmLocked,
      beat: match.beat,
      detectorBpm: r.bpm,
      confirmed: (clock as unknown as { autoConfirmed: boolean }).autoConfirmed,
    });
  }
  return frames;
}

const median = (values: number[]) =>
  values.length === 0 ? NaN : [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;

export type SyncMetrics = {
  lockAtMs: number | null;
  /** Relative tempo error after settling; octave errors are reported separately. */
  tempoError: number;
  octave: boolean;
  /** Median distance from a clock beat to the nearest true beat, in beats (0–0.5). */
  phaseError: number;
};

export function measure(track: Track, frames: SimFrame[], settleMs = 15000): SyncMetrics {
  const lockAtMs = frames.find((f) => f.timing.synced)?.t ?? null;
  const settled = frames.filter((f) => f.t >= settleMs && f.timing.synced);
  const bpm = median(settled.map((f) => f.bpm));
  const direct = Math.abs(bpm - track.spec.bpm) / track.spec.bpm;
  const folded = Math.min(
    direct,
    Math.abs(bpm * 2 - track.spec.bpm) / track.spec.bpm,
    Math.abs(bpm / 2 - track.spec.bpm) / track.spec.bpm,
  );
  const phase: number[] = [];
  for (const f of settled) {
    if (!f.timing.beatJustTicked) continue;
    const rel = (f.t - track.spec.offsetMs) / track.beatMs;
    phase.push(Math.abs(rel - Math.round(rel)));
  }
  return {
    lockAtMs,
    tempoError: folded,
    octave: direct > folded + 1e-9,
    phaseError: median(phase),
  };
}

/**
 * Where the clock thinks it is in the phrase, half a beat into the given true
 * beat (0-based, counted from the start of the track). Returns the clock's
 * beat-in-phrase (1–16), or null if not synced.
 */
export function clockBeatInPhraseAt(track: Track, frames: SimFrame[], trueBeat: number) {
  const at = track.spec.offsetMs + (trueBeat + 0.5) * track.beatMs;
  const frame = frames.find((f) => f.t >= at);
  return frame && frame.timing.synced ? frame.timing.beatInPhrase : null;
}
