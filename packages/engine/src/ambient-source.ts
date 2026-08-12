import type { AudioBands, AudioTiming } from "./audio";

/**
 * Synthetic "no music" source: generates musically-structured AudioBands so
 * every visual (and the SongClock-driven phrase machinery) runs without any
 * capture — ambient/background mode. The output mimics a locked steady
 * track: kicks on the beat grid, snare backbeats, off-beat hats, 32-beat
 * sections with energy arcs and periodic breakdowns, plus a shaped spectrum
 * for bin-driven views. It reports `bpmLocked` with high confidence so the
 * SongClock locks its bar grid to the synthetic tempo and phrase-based view
 * cycling behaves exactly as it does with real music.
 */

const BIN_COUNT = 512;

const ZERO_TIMING: AudioTiming = {
  readCpuMs: 0,
  audioToRenderMs: 0,
  baseLatencyMs: 0,
  outputLatencyMs: 0,
  fftWindowMs: 0,
  bassDelta: 0,
  signalChangeAt: 0,
};

function clamp01(v: number) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export class AmbientSource {
  readonly bpm: number;
  private startMs = -1;
  private lastBeatIndex = -1;
  private onsetEnv = 0;
  private readonly seed: number;
  private readonly bands: AudioBands;

  constructor(bpm?: number, seed?: number) {
    this.bpm = bpm ?? 96 + Math.floor(Math.random() * 32);
    this.seed = seed ?? Math.random() * 6.283;
    this.bands = {
      bass: 0,
      mid: 0,
      high: 0,
      centroid: 0.4,
      beat: false,
      bpm: this.bpm,
      bpmConfidence: 0.92,
      beatPhase: 0,
      onsetStrength: 0,
      signalSwing: false,
      bpmLocked: true,
      bins: new Uint8Array(BIN_COUNT),
      timing: { ...ZERO_TIMING },
      fftReadAt: 0,
    };
  }

  /** Forget elapsed time so a re-entry restarts on beat 1. */
  reset() {
    this.startMs = -1;
    this.lastBeatIndex = -1;
    this.onsetEnv = 0;
  }

  read(nowMs: number): AudioBands {
    if (this.startMs < 0) this.startMs = nowMs;
    const t = (nowMs - this.startMs) / 1000;
    const beatPeriod = 60 / this.bpm;
    const beatFloat = t / beatPeriod;
    const beatIndex = Math.floor(beatFloat);
    const beatPhase = beatFloat - beatIndex;
    const beat = beatIndex !== this.lastBeatIndex;
    this.lastBeatIndex = beatIndex;

    // 32-beat sections; every fourth is a breakdown (energy dip, soft kick),
    // with a slow arc across sections and a ramp into each section boundary.
    const section = Math.floor(beatIndex / 32);
    const posInSection = (beatIndex % 32) / 32;
    const breakdown = section % 4 === 3;
    const arc = 0.62 + 0.22 * Math.sin(section * 1.7 + this.seed);
    const buildRamp = breakdown ? 0 : posInSection * 0.22;
    const energy = clamp01(arc + buildRamp) * (breakdown ? 0.55 : 1);

    // Percussion envelopes on the beat grid.
    const kick = Math.exp(-beatPhase * 8) * (breakdown ? 0.45 : 1);
    const backbeat = beatIndex % 2 === 1 ? Math.exp(-beatPhase * 10) : 0;
    const eighthPhase = beatFloat * 2 - Math.floor(beatFloat * 2);
    const hat = Math.exp(-eighthPhase * 9) * (breakdown ? 0.5 : 0.85);

    // Slow melodic wobbles keep sustained motion between hits.
    const bassWobble = 0.14 + 0.1 * Math.sin(t * 0.9 + this.seed);
    const midGroove = 0.24 + 0.14 * Math.sin(t * 1.6 + this.seed * 2.1);
    const shimmer = 0.06 + 0.05 * Math.sin(t * 3.3 + this.seed * 3.7);

    const bass = clamp01(kick * 0.85 * energy + bassWobble * energy);
    const mid = clamp01(midGroove * energy + backbeat * 0.5 * energy);
    const high = clamp01(hat * 0.55 * energy + shimmer);

    this.onsetEnv = beat ? (breakdown ? 0.4 : 0.75) : Math.max(0, this.onsetEnv - 0.05);

    const b = this.bands;
    b.bass = bass;
    b.mid = mid;
    b.high = high;
    b.centroid = clamp01(0.34 + 0.14 * Math.sin(t * 0.23 + this.seed) + high * 0.2);
    b.beat = beat;
    b.beatPhase = beatPhase;
    b.onsetStrength = this.onsetEnv;
    b.fftReadAt = nowMs;

    // Shaped spectrum: bass shelf, mid hump, high tail, with per-bin flicker
    // so bin-driven views (bars, ripple columns) look alive, not static.
    const bins = b.bins;
    for (let i = 0; i < BIN_COUNT; i += 1) {
      const f = i / BIN_COUNT;
      const bassShelf = Math.exp(-f * 14) * bass;
      const midHump = Math.exp(-((f - 0.28) * (f - 0.28)) / 0.02) * mid * 0.9;
      const highTail = Math.exp(-((f - 0.7) * (f - 0.7)) / 0.06) * high * 0.8;
      const flicker = 0.75 + 0.25 * Math.sin(i * 12.9898 + t * (2 + f * 6) + this.seed);
      bins[i] = Math.min(255, Math.round((bassShelf + midHump + highTail) * flicker * 255));
    }

    return b;
  }
}
