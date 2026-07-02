import { describe, expect, it } from "vitest";
import { BPMDetector } from "../bpm-detector";

/**
 * Regression suite for BPM locking on *realistic* music, not clean pulse
 * trains — jittered beat timing, kick/snare/hat layering, sustained pad
 * energy, and decaying transient envelopes. The detector shipped for a while
 * in a state where clean synthetic trains locked instantly but none of these
 * scenarios ever locked (confidence judged on raw mixed peak intervals never
 * sustained the lock gate), which read as "BPM detection doesn't work" on any
 * real track.
 */

// Deterministic PRNG so runs are comparable.
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Onset = { t: number; bass: number; mid: number; high: number; decayMs: number };

function buildRealisticTrack(bpm: number, totalMs: number, seed = 42) {
  const rand = mulberry32(seed);
  const beatMs = 60000 / bpm;
  const onsets: Onset[] = [];
  let beat = 0;
  for (let t = 0; t < totalMs; t += beatMs) {
    const jitter = (rand() - 0.5) * beatMs * 0.04; // ±2% timing jitter
    const bt = t + jitter;
    const inBar = beat % 4;
    // Kick on 1 & 3 — strong bass
    if (inBar === 0 || inBar === 2) {
      onsets.push({ t: bt, bass: 0.28 + rand() * 0.08, mid: 0.05, high: 0.03, decayMs: 140 });
    }
    // Snare on 2 & 4 — mid heavy
    if (inBar === 1 || inBar === 3) {
      onsets.push({ t: bt, bass: 0.08, mid: 0.16 + rand() * 0.05, high: 0.08, decayMs: 160 });
    }
    // Hi-hats on every 8th note — small high-band ticks
    for (const frac of [0, 0.5]) {
      onsets.push({
        t: bt + frac * beatMs + (rand() - 0.5) * 8,
        bass: 0.005,
        mid: 0.01,
        high: 0.05 + rand() * 0.02,
        decayMs: 70,
      });
    }
    beat++;
  }
  return onsets;
}

/** Simulate AnalyserNode-smoothed band energy at time t (sum of decaying envelopes + pad). */
function bandsAt(onsets: Onset[], t: number, padPhaseSeed: number) {
  let bass = 0.06 + 0.02 * Math.sin(t * 0.0005 + padPhaseSeed); // sustained pad/bassline hum
  let mid = 0.09 + 0.03 * Math.sin(t * 0.0003 + padPhaseSeed * 1.7); // chords/vocals
  let high = 0.04 + 0.01 * Math.sin(t * 0.0007 + padPhaseSeed * 0.6);
  for (const o of onsets) {
    const dt = t - o.t;
    if (dt < 0 || dt > o.decayMs * 4) continue;
    // fast attack (~20ms), exponential decay
    const env = dt < 20 ? dt / 20 : Math.exp(-(dt - 20) / o.decayMs);
    bass += o.bass * env;
    mid += o.mid * env;
    high += o.high * env;
  }
  return { bass: Math.min(1, bass), mid: Math.min(1, mid), high: Math.min(1, high) };
}

function runScenario(bpm: number, seed: number, volumeScale = 1) {
  const totalMs = 45000;
  const onsets = buildRealisticTrack(bpm, totalMs, seed);
  const detector = new BPMDetector();
  const samples: { t: number; bpm: number; conf: number; locked: boolean }[] = [];
  for (let t = 0; t <= totalMs; t += 50) {
    const b = bandsAt(onsets, t, seed * 0.37);
    detector.feedBands(
      { bass: b.bass * volumeScale, mid: b.mid * volumeScale, high: b.high * volumeScale },
      t,
    );
    const r = detector.tick(t);
    if (t % 1000 < 50) {
      samples.push({ t, bpm: r.bpm, conf: r.confidence, locked: r.bpmLocked });
    }
  }
  return samples;
}

/** Distance of `value` to `target` accepting the 2x/0.5x octave as equivalent. */
function octaveFoldedError(value: number, target: number): number {
  const candidates = [value, value * 2, value / 2];
  return Math.min(...candidates.map((v) => Math.abs(v - target) / target));
}

function assertLocksReliably(trueBpm: number, seed: number, volumeScale = 1) {
  const samples = runScenario(trueBpm, seed, volumeScale);
  const after15 = samples.filter((s) => s.t >= 15000);

  const firstLockAt = samples.find((s) => s.locked)?.t;
  expect(firstLockAt, "should lock at all").toBeDefined();
  expect(firstLockAt!, "should lock within 8s").toBeLessThanOrEqual(8000);

  const lockedFraction = after15.filter((s) => s.locked).length / after15.length;
  expect(lockedFraction, "should stay locked ≥70% after settling").toBeGreaterThanOrEqual(0.7);

  // Steady-state tempo should be near the truth (octave-equivalents accepted —
  // the octave-correction path resolves those given agreeing evidence).
  const lockedSamples = after15.filter((s) => s.locked);
  const median = lockedSamples.map((s) => s.bpm).sort((a, b) => a - b)[
    Math.floor(lockedSamples.length / 2)
  ]!;
  expect(
    octaveFoldedError(median, trueBpm),
    `steady-state ${median} should be within 8% of ${trueBpm} (octave-folded)`,
  ).toBeLessThanOrEqual(0.08);
}

describe("BPMDetector on realistic music", () => {
  it("locks on a 120 BPM kick/snare/hat mix", () => assertLocksReliably(120, 42));
  it("locks on a 95 BPM mix", () => assertLocksReliably(95, 7));
  it("locks on a 140 BPM mix", () => assertLocksReliably(140, 99));
  it("locks on a quiet 128 BPM mix (0.5x volume)", () => assertLocksReliably(128, 13, 0.5));
  it("locks on a 110 BPM mix", () => assertLocksReliably(110, 1234));
});
