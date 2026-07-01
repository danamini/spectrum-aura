import { BeatMatcher } from "./beat-matcher";
import { BPMDetector } from "./bpm-detector";
import { formatMediaError } from "./audio-support";

export type AudioTiming = {
  readCpuMs: number;
  audioToRenderMs: number;
  baseLatencyMs: number;
  outputLatencyMs: number;
  fftWindowMs: number;
  bassDelta: number;
  signalChangeAt: number;
};

export type AudioBands = {
  bass: number;
  mid: number;
  high: number;
  centroid: number; // 0..1
  beat: boolean;
  bpm: number; // detected BPM (60-200, or 0 if not detected)
  bpmConfidence: number; // 0-1, how confident the BPM detection is
  /** 0–1 phase within the current beat period (BPM clock). */
  beatPhase: number;
  /** Fused onset strength from multi-band deltas. */
  onsetStrength: number;
  /** True when bass/mid/centroid swing indicates a musical change. */
  signalSwing: boolean;
  /** BPM is locked — tempo won't drift mid-song. */
  bpmLocked: boolean;
  bins: Uint8Array;
  timing: AudioTiming;
  /** Monotonic timestamp (performance.now) when this frame's FFT data was read. */
  fftReadAt: number;
};

const EMPTY_TIMING: AudioTiming = {
  readCpuMs: 0,
  audioToRenderMs: 0,
  baseLatencyMs: 0,
  outputLatencyMs: 0,
  fftWindowMs: 0,
  bassDelta: 0,
  signalChangeAt: 0,
};

const EMPTY_BANDS: AudioBands = {
  bass: 0,
  mid: 0,
  high: 0,
  centroid: 0,
  beat: false,
  bpm: 0,
  bpmConfidence: 0,
  beatPhase: 0,
  onsetStrength: 0,
  signalSwing: false,
  bpmLocked: false,
  bins: new Uint8Array(0),
  timing: EMPTY_TIMING,
  fftReadAt: 0,
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  gain: GainNode | null = null;
  stream: MediaStream | null = null;
  bins: Uint8Array = new Uint8Array(0);

  private beatMatcher = new BeatMatcher();
  private bpmDetector = new BPMDetector();
  private bandBounds = { n: 0, bassEnd: 0, midEnd: 0, bassDiv: 1, midDiv: 1, highDiv: 1 };
  /** Reused every `read()` call so the hot path doesn't allocate a fresh bands/timing object every frame. */
  private outTiming: AudioTiming = { ...EMPTY_TIMING };
  private outBands: AudioBands = { ...EMPTY_BANDS, timing: this.outTiming };

  async startMic(options?: { latencyOptimized?: boolean }) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.attach(stream, options);
    } catch (error) {
      throw new Error(formatMediaError(error));
    }
  }

  async startSystem(options?: { latencyOptimized?: boolean }) {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      stream.getVideoTracks().forEach((t) => t.stop());
      if (stream.getAudioTracks().length === 0) {
        stream.getTracks().forEach((t) => t.stop());
        throw new Error(
          'No audio track was shared. In the Chrome dialog, choose a Tab and tick "Share tab audio".',
        );
      }
      this.attach(stream, options);
    } catch (error) {
      if (error instanceof Error && error.message.includes("No audio track was shared")) {
        throw error;
      }
      throw new Error(formatMediaError(error));
    }
  }

  private attach(stream: MediaStream, options?: { latencyOptimized?: boolean }) {
    this.stop();
    const latencyOptimized = options?.latencyOptimized ?? true;
    const ctx = new AudioContext({
      latencyHint: latencyOptimized ? "interactive" : "playback",
    });
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = latencyOptimized ? 0.45 : 0.82;
    source.connect(gain).connect(analyser);
    this.ctx = ctx;
    this.source = source;
    this.gain = gain;
    this.analyser = analyser;
    this.stream = stream;
    this.bins = new Uint8Array(analyser.frequencyBinCount);
    this.updateBandBounds(analyser.frequencyBinCount);
    void ctx.resume();
  }

  private updateBandBounds(n: number) {
    const bassEnd = Math.floor(n * 0.08);
    const midEnd = Math.floor(n * 0.35);
    this.bandBounds = {
      n,
      bassEnd,
      midEnd,
      bassDiv: bassEnd || 1,
      midDiv: midEnd - bassEnd || 1,
      highDiv: n - midEnd || 1,
    };
  }

  setSmoothing(v: number) {
    if (this.analyser) this.analyser.smoothingTimeConstant = v;
  }
  setFftSize(n: number) {
    if (this.analyser) {
      this.analyser.fftSize = n;
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
      this.updateBandBounds(this.analyser.frequencyBinCount);
    }
  }
  setGain(v: number) {
    if (this.gain) this.gain.gain.value = v;
  }

  read(beatThreshold: number, clockTime?: number): AudioBands {
    if (!this.analyser) {
      const out = this.outBands;
      out.bass = 0;
      out.mid = 0;
      out.high = 0;
      out.centroid = 0;
      out.beat = false;
      out.bpm = 0;
      out.bpmConfidence = 0;
      out.beatPhase = 0;
      out.onsetStrength = 0;
      out.signalSwing = false;
      out.bpmLocked = false;
      out.bins = this.bins;
      out.fftReadAt = 0;
      return out;
    }

    const t0 = performance.now();
    this.analyser.getByteFrequencyData(this.bins as Uint8Array<ArrayBuffer>);
    const fftReadAt = performance.now();

    const { bassEnd, midEnd, n, bassDiv, midDiv, highDiv } = this.bandBounds;
    const inv255 = 1 / 255;
    let bass = 0,
      mid = 0,
      high = 0,
      weighted = 0,
      total = 0;

    for (let i = 0; i < n; i++) {
      const v = this.bins[i] * inv255;
      if (i < bassEnd) bass += v;
      else if (i < midEnd) mid += v;
      else high += v;
      weighted += i * v;
      total += v;
    }
    bass /= bassDiv;
    mid /= midDiv;
    high /= highDiv;
    const centroid = total > 0 ? weighted / total / n : 0;

    const match = this.beatMatcher.detect(bass, mid, high, centroid, beatThreshold, fftReadAt);

    this.bpmDetector.feedBands(
      {
        bass,
        mid,
        high,
        bassDelta: match.bassDelta,
        midDelta: match.midDelta,
      },
      fftReadAt,
    );
    const {
      bpm,
      confidence: bpmConfidence,
      beatPhase,
      bpmLocked,
    } = this.bpmDetector.tick(clockTime ?? fftReadAt);

    const sr = this.ctx?.sampleRate ?? 48000;
    const fftSize = this.analyser.fftSize;
    const readCpuMs = performance.now() - t0;

    const out = this.outBands;
    out.bass = bass;
    out.mid = mid;
    out.high = high;
    out.centroid = centroid;
    out.beat = match.beat;
    out.bpm = bpm;
    out.bpmConfidence = bpmConfidence;
    out.beatPhase = beatPhase;
    out.onsetStrength = match.onsetStrength;
    out.signalSwing = match.signalSwing;
    out.bpmLocked = bpmLocked;
    out.bins = this.bins;
    out.fftReadAt = fftReadAt;
    const timing = out.timing;
    timing.readCpuMs = readCpuMs;
    timing.audioToRenderMs = 0;
    timing.baseLatencyMs = (this.ctx?.baseLatency ?? 0) * 1000;
    timing.outputLatencyMs = (this.ctx?.outputLatency ?? 0) * 1000;
    timing.fftWindowMs = (fftSize / sr) * 1000;
    timing.bassDelta = match.bassDelta;
    timing.signalChangeAt = this.beatMatcher.signalChangeAt;
    return out;
  }

  hintBeat(time: number, downbeat = false, fallbackBpm = 0): void {
    this.bpmDetector.hintBeat(time, downbeat, fallbackBpm);
  }

  stop() {
    try {
      this.stream?.getTracks().forEach((t) => t.stop());
    } catch {
      // Ignore teardown errors from stale/ended tracks.
    }
    try {
      this.ctx?.close();
    } catch {
      // Ignore close errors if the context was already terminated.
    }
    this.ctx = null;
    this.analyser = null;
    this.source = null;
    this.gain = null;
    this.stream = null;
    this.beatMatcher.reset();
    this.bpmDetector.reset();
  }

  isRunning() {
    return !!this.ctx;
  }
}
