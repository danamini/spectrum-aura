import { describe, expect, it } from "vitest";
import type { AudioBands } from "../audio";
import { SpectrumContrast } from "../spectrum-contrast";

const DT = 1 / 60;
const bands = (bins: number[], level = 0.7): AudioBands => ({
  bass: level,
  mid: level,
  high: level,
  centroid: 0.4,
  beat: false,
  bpm: 120,
  bpmConfidence: 0.9,
  beatPhase: 0,
  onsetStrength: 0,
  signalSwing: false,
  bpmLocked: true,
  bins: new Uint8Array(bins),
  fftReadAt: 0,
  timing: {
    readCpuMs: 0,
    audioToRenderMs: 0,
    baseLatencyMs: 0,
    outputLatencyMs: 0,
    fftWindowMs: 0,
    bassDelta: 0,
    signalChangeAt: 0,
  },
});

/** Runs a loud, compressed signal: a steady 180 with a kick to 215 every half second. */
function runKicks(contrast: SpectrumContrast, amount: number, seconds = 8) {
  const seen: number[] = [];
  const bassSeen: number[] = [];
  for (let i = 0; i < seconds * 60; i++) {
    const kick = i % 30 < 4;
    const frame = bands([kick ? 215 : 180, 180], kick ? 0.84 : 0.7);
    contrast.apply(frame, DT, amount);
    if (i > 5 * 60) {
      seen.push(frame.bins[0]!);
      bassSeen.push(frame.bass);
    }
  }
  return { seen, bassSeen };
}

describe("spectrum contrast", () => {
  it("leaves the signal alone at amount 0", () => {
    const frame = bands([10, 120, 250]);
    const source = frame.bins;
    new SpectrumContrast().apply(frame, DT, 0);
    expect(frame.bins).toBe(source);
    expect(frame.bass).toBe(0.7);
  });

  it("never writes into the caller's bins", () => {
    const frame = bands([40, 200, 90]);
    const source = frame.bins;
    const copy = [...source];
    new SpectrumContrast().apply(frame, DT, 1);
    expect(frame.bins).not.toBe(source);
    expect([...source]).toEqual(copy);
  });

  it("stretches a small swing on a loud signal into a large one", () => {
    // Raw: the kick moves the bin from 180 to 215, 14% of full scale.
    const raw = (215 - 180) / 255;
    const { seen, bassSeen } = runKicks(new SpectrumContrast(), 1);
    const swing = (Math.max(...seen) - Math.min(...seen)) / 255;
    expect(swing).toBeGreaterThan(raw * 4);
    expect(Math.max(...seen)).toBeGreaterThan(215);
    // The band level does the same: a 0.14 swing becomes most of the range.
    expect(Math.max(...bassSeen) - Math.min(...bassSeen)).toBeGreaterThan(0.5);
  });

  it("stops a sustained level holding the display up", () => {
    const contrast = new SpectrumContrast();
    let last = 255;
    for (let i = 0; i < 12 * 60; i++) {
      const frame = bands([200, 200]);
      contrast.apply(frame, DT, 1);
      last = frame.bins[0]!;
    }
    expect(last).toBeLessThan(60);
  });

  it("blends by amount", () => {
    const half = runKicks(new SpectrumContrast(), 0.5).seen;
    const full = runKicks(new SpectrumContrast(), 1).seen;
    const swing = (v: number[]) => Math.max(...v) - Math.min(...v);
    expect(swing(half)).toBeGreaterThan(35);
    expect(swing(half)).toBeLessThan(swing(full));
  });

  it("does not stretch silence or hiss into signal", () => {
    const contrast = new SpectrumContrast();
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      const frame = bands([i % 2 ? 3 : 0, 2], 0.01);
      contrast.apply(frame, DT, 1);
      peak = Math.max(peak, frame.bins[0]!);
    }
    expect(peak).toBeLessThan(40);
  });

  it("passes quiet room noise through instead of stretching it", () => {
    // A quiet microphone: bins hover around 85 and jitter by far more than
    // the minimum range, which used to be stretched to full height.
    const contrast = new SpectrumContrast();
    let seed = 7;
    const noise = () => {
      seed = (seed * 16807) % 2147483647;
      return 60 + (seed % 50);
    };
    let worst = 0;
    for (let i = 0; i < 900; i++) {
      const raw = [noise(), noise()];
      const frame = bands(raw, 0.3);
      contrast.apply(frame, DT, 1);
      worst = Math.max(worst, frame.bins[0]! - raw[0]!, frame.bass - 0.3);
    }
    expect(worst).toBeLessThanOrEqual(25);
  });

  it("stays in range under hostile input and follows bin-count changes", () => {
    const contrast = new SpectrumContrast();
    for (let i = 0; i < 300; i++) {
      const frame = bands(i % 2 ? [255, 0, 255, 0] : [0, 255], i % 3 ? 1 : 0);
      contrast.apply(frame, i % 5 === 0 ? 9 : DT, 5);
      expect([...frame.bins].every((v) => v >= 0 && v <= 255)).toBe(true);
      for (const v of [frame.bass, frame.mid, frame.high]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});
