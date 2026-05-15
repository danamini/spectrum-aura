import { BPMDetector } from "./bpm-detector";

export type AudioBands = {
  bass: number;
  mid: number;
  high: number;
  centroid: number; // 0..1
  beat: boolean;
  bpm: number; // detected BPM (60-200, or 0 if not detected)
  bpmConfidence: number; // 0-1, how confident the BPM detection is
  bins: Uint8Array;
};

export class AudioEngine {
  ctx: AudioContext | null = null;
  analyser: AnalyserNode | null = null;
  source: MediaStreamAudioSourceNode | null = null;
  gain: GainNode | null = null;
  stream: MediaStream | null = null;
  bins: Uint8Array = new Uint8Array(0);

  private bassHistory: number[] = [];
  private lastBeat = 0;
  private bpmDetector = new BPMDetector();

  async startMic(options?: { latencyOptimized?: boolean }) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.attach(stream, options);
  }

  async startSystem(options?: { latencyOptimized?: boolean }) {
    // Chromium trick: getDisplayMedia with audio. User must check "Share tab audio".
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: true,
    });
    // strip video tracks — we only want audio
    stream.getVideoTracks().forEach((t) => t.stop());
    if (stream.getAudioTracks().length === 0) {
      stream.getTracks().forEach((t) => t.stop());
      throw new Error(
        'No audio track was shared. In the Chrome dialog, choose a Tab and tick "Share tab audio".',
      );
    }
    this.attach(stream, options);
  }

  private attach(stream: MediaStream, options?: { latencyOptimized?: boolean }) {
    this.stop();
    const ctx = new AudioContext({
      latencyHint: options?.latencyOptimized ? "interactive" : "playback",
    });
    const source = ctx.createMediaStreamSource(stream);
    const gain = ctx.createGain();
    gain.gain.value = 1;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.82;
    source.connect(gain).connect(analyser);
    // do NOT connect analyser to destination — avoid feedback / double playback
    this.ctx = ctx;
    this.source = source;
    this.gain = gain;
    this.analyser = analyser;
    this.stream = stream;
    this.bins = new Uint8Array(analyser.frequencyBinCount);
  }

  setSmoothing(v: number) {
    if (this.analyser) this.analyser.smoothingTimeConstant = v;
  }
  setFftSize(n: number) {
    if (this.analyser) {
      this.analyser.fftSize = n;
      this.bins = new Uint8Array(this.analyser.frequencyBinCount);
    }
  }
  setGain(v: number) {
    if (this.gain) this.gain.gain.value = v;
  }

  read(beatThreshold: number): AudioBands {
    if (!this.analyser) {
      return { bass: 0, mid: 0, high: 0, centroid: 0, beat: false, bins: this.bins };
    }
    this.analyser.getByteFrequencyData(this.bins as Uint8Array<ArrayBuffer>);
    const n = this.bins.length;
    const bassEnd = Math.floor(n * 0.08);
    const midEnd = Math.floor(n * 0.35);
    let bass = 0,
      mid = 0,
      high = 0;
    let weighted = 0,
      total = 0;
    for (let i = 0; i < n; i++) {
      const v = this.bins[i] / 255;
      if (i < bassEnd) bass += v;
      else if (i < midEnd) mid += v;
      else high += v;
      weighted += i * v;
      total += v;
    }
    bass /= bassEnd || 1;
    mid /= midEnd - bassEnd || 1;
    high /= n - midEnd || 1;
    const centroid = total > 0 ? weighted / total / n : 0;

    // beat detect
    this.bassHistory.push(bass);
    if (this.bassHistory.length > 43) this.bassHistory.shift();
    const avg = this.bassHistory.reduce((s, x) => s + x, 0) / this.bassHistory.length;
    const now = performance.now();
    let beat = false;
    if (bass > avg * beatThreshold && bass > 0.35 && now - this.lastBeat > 180) {
      beat = true;
      this.lastBeat = now;
    }

    // BPM detection
    this.bpmDetector.feed(bass, now);
    const bpm = this.bpmDetector.getBPM();
    const bpmConfidence = this.bpmDetector.getConfidence();

    return { bass, mid, high, centroid, beat, bpm, bpmConfidence, bins: this.bins };
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
    this.bpmDetector.reset();
  }

  isRunning() {
    return !!this.ctx;
  }
}
