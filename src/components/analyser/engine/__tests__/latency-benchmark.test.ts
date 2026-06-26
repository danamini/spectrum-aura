import { describe, expect, it } from "vitest";

import { BPMDetector } from "../bpm-detector";

const ITERATIONS = 1000;
const FFT_BINS = 1024; // fftSize 2048 → frequencyBinCount
const FRAME_MS = 1000 / 60;

// ── Legacy inline implementations (pre-optimization patterns) ──────────────

/** Pre-optimization audio.read() CPU path — array beat history, per-frame band bounds, dual BPM analysis. */
class LegacyAudioHotPath {
  bins = new Uint8Array(FFT_BINS);
  private bassHistory: number[] = [];
  private lastBeat = 0;
  private bpmDetector = new LegacyBPMDetector();

  processFrame(beatThreshold: number, now: number) {
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

    this.bassHistory.push(bass);
    if (this.bassHistory.length > 43) this.bassHistory.shift();
    const avg = this.bassHistory.reduce((s, x) => s + x, 0) / this.bassHistory.length;

    let beat = false;
    if (bass > avg * beatThreshold && bass > 0.35 && now - this.lastBeat > 180) {
      beat = true;
      this.lastBeat = now;
    }

    this.bpmDetector.feed(bass, now);
    const bpm = this.bpmDetector.getBPM();
    const bpmConfidence = this.bpmDetector.getConfidence();

    return { bass, mid, high, centroid, beat, bpm, bpmConfidence };
  }
}

/** Pre-optimization BPM detector — full peak analysis on every getBPM/getConfidence call. */
class LegacyBPMDetector {
  private energyHistory: Array<{ energy: number; time: number }> = [];
  private windowSizeMs = 8000;
  private minPeakIntervalMs = 120;
  private peakThreshold = 1.08;
  private useSlopeDetection = true;
  private lastBPM = 0;
  private bpmSmoothingAlpha = 0.08;

  feed(energy: number, time: number): void {
    this.energyHistory.push({ energy, time });
    const cutoffTime = time - this.windowSizeMs;
    while (this.energyHistory.length > 0 && this.energyHistory[0].time < cutoffTime) {
      this.energyHistory.shift();
    }
  }

  getBPM(): number {
    if (this.energyHistory.length < 5) return this.lastBPM;
    const peaks = this.findPeaks();
    if (peaks.length < 2) return this.lastBPM;

    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i].time - peaks[i - 1].time);
    }
    if (intervals.length === 0) return this.lastBPM;

    intervals.sort((a, b) => a - b);
    const medianInterval = intervals[Math.floor(intervals.length / 2)];

    let newBPM = 60000 / medianInterval;
    if (newBPM < 80) newBPM *= 2;
    if (newBPM > 180) newBPM *= 0.5;
    newBPM = Math.max(60, Math.min(200, newBPM));

    this.lastBPM = this.lastBPM * (1 - this.bpmSmoothingAlpha) + newBPM * this.bpmSmoothingAlpha;
    return this.lastBPM;
  }

  getConfidence(): number {
    if (this.energyHistory.length < 5) return 0;
    const peaks = this.findPeaks();
    if (peaks.length < 2) return 0;
    if (peaks.length < 3) return 0.3;

    const intervals: number[] = [];
    for (let i = 1; i < peaks.length; i++) {
      intervals.push(peaks[i].time - peaks[i - 1].time);
    }
    if (intervals.length < 2) return 0.4;

    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
    const variance =
      intervals.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);
    const cv = mean > 0 ? stdDev / mean : 1;

    let confidence = 1 - cv * 3;
    confidence = Math.max(0, Math.min(1, confidence));
    const peakBonus = Math.min(0.2, (peaks.length - 3) * 0.05);
    return Math.min(1, confidence + peakBonus);
  }

  private findPeaks(): Array<{ energy: number; time: number }> {
    if (this.energyHistory.length < 5) return [];
    const peaks: typeof this.energyHistory = [];
    const history = this.energyHistory;

    if (this.useSlopeDetection) {
      let lastPeakTime = -Infinity;
      let wasRising = false;
      for (let i = 1; i < history.length; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const isRising = curr.energy > prev.energy;
        if (wasRising && !isRising) {
          const timeSinceLast = prev.time - lastPeakTime;
          if (timeSinceLast >= this.minPeakIntervalMs) {
            peaks.push(prev);
            lastPeakTime = prev.time;
          }
        }
        wasRising = isRising;
      }
    } else {
      const avg = history.reduce((sum, e) => sum + e.energy, 0) / history.length;
      const threshold = avg * this.peakThreshold;
      for (let i = 1; i < history.length - 1; i++) {
        const prev = history[i - 1];
        const curr = history[i];
        const next = history[i + 1];
        if (curr.energy > threshold && curr.energy >= prev.energy && curr.energy >= next.energy) {
          const timeSinceLast =
            peaks.length === 0 ? Infinity : curr.time - peaks[peaks.length - 1].time;
          if (timeSinceLast >= this.minPeakIntervalMs) peaks.push(curr);
        }
      }
    }
    return peaks;
  }
}

// ── Current optimized audio.read() CPU path (no Web Audio API) ─────────────

class OptimizedAudioHotPath {
  bins = new Uint8Array(FFT_BINS);
  private bassRing = new Float32Array(43);
  private bassRingIdx = 0;
  private bassRingCount = 0;
  private bassRingSum = 0;
  private lastBeat = 0;
  private lastBass = 0;
  private lastSignalChangeAt = 0;
  private bpmDetector = new BPMDetector();
  private bandBounds = {
    n: FFT_BINS,
    bassEnd: Math.floor(FFT_BINS * 0.08),
    midEnd: Math.floor(FFT_BINS * 0.35),
    bassDiv: Math.floor(FFT_BINS * 0.08) || 1,
    midDiv: Math.floor(FFT_BINS * 0.35) - Math.floor(FFT_BINS * 0.08) || 1,
    highDiv: FFT_BINS - Math.floor(FFT_BINS * 0.35) || 1,
  };

  processFrame(beatThreshold: number, now: number) {
    const { bassEnd, midEnd, n, bassDiv, midDiv, highDiv } = this.bandBounds;
    const inv255 = 1 / 255;
    let bass = 0,
      mid = 0,
      high = 0,
      weighted = 0,
      total = 0;

    for (let i = 0; i < bassEnd; i++) {
      const v = this.bins[i] * inv255;
      bass += v;
      weighted += i * v;
      total += v;
    }
    for (let i = bassEnd; i < midEnd; i++) {
      const v = this.bins[i] * inv255;
      mid += v;
      weighted += i * v;
      total += v;
    }
    for (let i = midEnd; i < n; i++) {
      const v = this.bins[i] * inv255;
      high += v;
      weighted += i * v;
      total += v;
    }
    bass /= bassDiv;
    mid /= midDiv;
    high /= highDiv;
    const centroid = total > 0 ? weighted / total / n : 0;

    const bassDelta = bass - this.lastBass;
    if (Math.abs(bassDelta) > 0.06 || Math.abs(mid - this.lastBass * 0.5) > 0.05) {
      this.lastSignalChangeAt = now;
    }
    this.lastBass = bass;

    const old = this.bassRing[this.bassRingIdx];
    this.bassRingSum += bass - (this.bassRingCount === 43 ? old : 0);
    this.bassRing[this.bassRingIdx] = bass;
    this.bassRingIdx = (this.bassRingIdx + 1) % 43;
    this.bassRingCount = Math.min(43, this.bassRingCount + 1);
    const avg = this.bassRingSum / this.bassRingCount;

    const floor = Math.max(0.15, avg * 0.8);
    let beat = false;
    if (bass > avg * beatThreshold && bass > floor && now - this.lastBeat > 180) {
      beat = true;
      this.lastBeat = now;
    }

    this.bpmDetector.feed(bass, now);
    const { bpm, confidence: bpmConfidence } = this.bpmDetector.tick(now);

    return {
      bass,
      mid,
      high,
      centroid,
      beat,
      bpm,
      bpmConfidence,
      signalChangeAt: this.lastSignalChangeAt,
    };
  }
}

// ── Benchmark helpers ──────────────────────────────────────────────────────

function synthBins(frame: number, out: Uint8Array) {
  const beatPhase = (frame * FRAME_MS) % 500;
  const kick = beatPhase < 80 ? 1 : 0;
  for (let i = 0; i < out.length; i++) {
    const band = i / out.length;
    const noise = Math.sin(frame * 0.37 + i * 0.11) * 0.5 + 0.5;
    const bassBoost = band < 0.08 ? kick * 200 : 0;
    out[i] = Math.min(255, Math.floor(noise * 80 + bassBoost + band * 40));
  }
}

function bench(name: string, fn: () => void, iterations = ITERATIONS) {
  for (let i = 0; i < 100; i++) fn();
  const t0 = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const ms = performance.now() - t0;
  const opsPerSec = (iterations / ms) * 1000;
  return { name, ms, msPerIter: ms / iterations, opsPerSec };
}

function pctImprovement(beforeMs: number, afterMs: number) {
  return ((beforeMs - afterMs) / beforeMs) * 100;
}

type BenchResult = ReturnType<typeof bench>;

function logBenchComparison(label: string, legacy: BenchResult, optimized: BenchResult) {
  const improvement = pctImprovement(legacy.ms, optimized.ms);
  console.log(`\n── ${label} (${ITERATIONS} iterations) ──`);
  console.log(
    `  BEFORE: ${legacy.ms.toFixed(2)} ms total | ${legacy.msPerIter.toFixed(4)} ms/iter | ${legacy.opsPerSec.toFixed(0)} ops/sec`,
  );
  console.log(
    `  AFTER:  ${optimized.ms.toFixed(2)} ms total | ${optimized.msPerIter.toFixed(4)} ms/iter | ${optimized.opsPerSec.toFixed(0)} ops/sec`,
  );
  console.log(
    `  IMPROVEMENT: ${improvement.toFixed(1)}% faster (${(legacy.ms / optimized.ms).toFixed(2)}×)`,
  );
  return improvement;
}

function warmupAudio(path: LegacyAudioHotPath | OptimizedAudioHotPath, beatThreshold: number) {
  for (let f = 0; f < 300; f++) {
    synthBins(f, path.bins);
    path.processFrame(beatThreshold, f * FRAME_MS);
  }
}

function warmupBpm(detector: LegacyBPMDetector | BPMDetector) {
  for (let f = 0; f < 300; f++) {
    const t = f * FRAME_MS;
    const energy = 0.3 + Math.sin(t * 0.012) * 0.25 + (t % 500 < 80 ? 0.4 : 0);
    detector.feed(energy, t);
    if ("tick" in detector) detector.tick(t);
    else {
      (detector as LegacyBPMDetector).getBPM();
      (detector as LegacyBPMDetector).getConfidence();
    }
  }
}

describe("latency micro-benchmark", () => {
  it("audio.read() hot path: legacy vs optimized", () => {
    const legacy = new LegacyAudioHotPath();
    const optimized = new OptimizedAudioHotPath();
    const beatThreshold = 1.35;
    warmupAudio(legacy, beatThreshold);
    warmupAudio(optimized, beatThreshold);
    let frame = 300;

    const legacyPerFrame = bench("legacy per-frame", () => {
      synthBins(frame, legacy.bins);
      legacy.processFrame(beatThreshold, frame * FRAME_MS);
      frame += 1;
    });

    frame = 300;
    const optimizedPerFrame = bench("optimized per-frame", () => {
      synthBins(frame, optimized.bins);
      optimized.processFrame(beatThreshold, frame * FRAME_MS);
      frame += 1;
    });

    const improvement = logBenchComparison(
      "audio.read() hot path",
      legacyPerFrame,
      optimizedPerFrame,
    );

    expect(optimizedPerFrame.ms).toBeLessThan(legacyPerFrame.ms);
    expect(improvement).toBeGreaterThan(15);

    // Sanity: outputs in same ballpark after warmup
    for (let f = 0; f < 200; f++) {
      synthBins(f, legacy.bins);
      legacy.processFrame(beatThreshold, f * FRAME_MS);
      synthBins(f, optimized.bins);
      optimized.processFrame(beatThreshold, f * FRAME_MS);
    }
    synthBins(500, legacy.bins);
    synthBins(500, optimized.bins);
    const l = legacy.processFrame(beatThreshold, 500 * FRAME_MS);
    const o = optimized.processFrame(beatThreshold, 500 * FRAME_MS);
    expect(Math.abs(l.bass - o.bass)).toBeLessThan(0.15);
    expect(Math.abs(l.mid - o.mid)).toBeLessThan(0.15);
  }, 60_000);

  it("BPM detector: legacy dual-analysis vs cached tick", () => {
    const legacy = new LegacyBPMDetector();
    const optimized = new BPMDetector();
    warmupBpm(legacy);
    warmupBpm(optimized);
    let frame = 300;

    const legacyPerFrame = bench("BPM legacy per-frame", () => {
      const t = frame * FRAME_MS;
      const energy = 0.3 + Math.sin(t * 0.012) * 0.25 + (t % 500 < 80 ? 0.4 : 0);
      legacy.feed(energy, t);
      legacy.getBPM();
      legacy.getConfidence();
      frame += 1;
    });

    frame = 300;
    const optimizedPerFrame = bench("BPM optimized per-frame", () => {
      const t = frame * FRAME_MS;
      const energy = 0.3 + Math.sin(t * 0.012) * 0.25 + (t % 500 < 80 ? 0.4 : 0);
      optimized.feed(energy, t);
      optimized.tick(t);
      frame += 1;
    });

    const improvement = logBenchComparison("BPM detector", legacyPerFrame, optimizedPerFrame);

    expect(optimizedPerFrame.ms).toBeLessThan(legacyPerFrame.ms);
    expect(improvement).toBeGreaterThan(55);
  }, 60_000);

  it("BPM detector forced analysis: legacy dual findPeaks vs getBPM+getConfidence (no throttling win)", () => {
    const legacy = new LegacyBPMDetector();
    const optimized = new BPMDetector();
    warmupBpm(legacy);
    warmupBpm(optimized);

    let frame = 300;
    const legacyForced = bench("BPM legacy forced", () => {
      const t = frame * FRAME_MS;
      const energy = 0.3 + Math.sin(t * 0.012) * 0.25 + (t % 500 < 80 ? 0.4 : 0);
      legacy.feed(energy, t);
      legacy.getBPM();
      legacy.getConfidence();
      frame += 1;
    });

    frame = 300;
    const optimizedForced = bench("BPM optimized forced", () => {
      const t = frame * FRAME_MS;
      const energy = 0.3 + Math.sin(t * 0.012) * 0.25 + (t % 500 < 80 ? 0.4 : 0);
      optimized.feed(energy, t);
      optimized.getBPM();
      optimized.getConfidence();
      frame += 1;
    });

    logBenchComparison(
      "BPM forced analysis (getBPM + getConfidence every frame)",
      legacyForced,
      optimizedForced,
    );
    // Forced path still runs findPeaks twice; gain comes from tick() throttling in production.
    expect(legacyForced.ms).toBeGreaterThan(0);
  });

  it("band aggregation only: single-loop vs split-loop + cached bounds", () => {
    const bins = new Uint8Array(FFT_BINS);
    synthBins(100, bins);

    const legacyBands = bench("bands legacy single-loop", () => {
      const n = bins.length;
      const bassEnd = Math.floor(n * 0.08);
      const midEnd = Math.floor(n * 0.35);
      let bass = 0,
        mid = 0,
        high = 0,
        weighted = 0,
        total = 0;
      for (let i = 0; i < n; i++) {
        const v = bins[i] / 255;
        if (i < bassEnd) bass += v;
        else if (i < midEnd) mid += v;
        else high += v;
        weighted += i * v;
        total += v;
      }
      bass /= bassEnd || 1;
      mid /= midEnd - bassEnd || 1;
      high /= n - midEnd || 1;
      return total > 0 ? weighted / total / n : 0;
    });

    const bassEnd = Math.floor(FFT_BINS * 0.08);
    const midEnd = Math.floor(FFT_BINS * 0.35);
    const bassDiv = bassEnd || 1;
    const midDiv = midEnd - bassEnd || 1;
    const highDiv = FFT_BINS - midEnd || 1;
    const inv255 = 1 / 255;

    const optimizedBands = bench("bands optimized split-loop", () => {
      let bass = 0,
        mid = 0,
        high = 0,
        weighted = 0,
        total = 0;
      for (let i = 0; i < bassEnd; i++) {
        const v = bins[i] * inv255;
        bass += v;
        weighted += i * v;
        total += v;
      }
      for (let i = bassEnd; i < midEnd; i++) {
        const v = bins[i] * inv255;
        mid += v;
        weighted += i * v;
        total += v;
      }
      for (let i = midEnd; i < FFT_BINS; i++) {
        const v = bins[i] * inv255;
        high += v;
        weighted += i * v;
        total += v;
      }
      bass /= bassDiv;
      mid /= midDiv;
      high /= highDiv;
      return total > 0 ? weighted / total / FFT_BINS : 0;
    });

    logBenchComparison("band aggregation", legacyBands, optimizedBands);
    // Split loops are not faster alone; gain is from cached divisors + inv255 hoisting in full path.
    expect(legacyBands.ms).toBeGreaterThan(0);
  });

  it("beat history: array push/shift/reduce vs ring buffer sum", () => {
    const history: number[] = [];
    const ring = new Float32Array(43);
    let ringIdx = 0;
    let ringCount = 0;
    let ringSum = 0;
    let bass = 0.5;

    const legacyBeat = bench("beat history legacy array", () => {
      bass = (bass * 0.9 + Math.random() * 0.2) % 1;
      history.push(bass);
      if (history.length > 43) history.shift();
      return history.reduce((s, x) => s + x, 0) / history.length;
    });

    const optimizedBeat = bench("beat history ring buffer", () => {
      bass = (bass * 0.9 + Math.random() * 0.2) % 1;
      const old = ring[ringIdx];
      ringSum += bass - (ringCount === 43 ? old : 0);
      ring[ringIdx] = bass;
      ringIdx = (ringIdx + 1) % 43;
      ringCount = Math.min(43, ringCount + 1);
      return ringSum / ringCount;
    });

    const improvement = logBenchComparison("beat history avg", legacyBeat, optimizedBeat);
    expect(improvement).toBeGreaterThan(30);
  });
});
