import { describe, expect, it } from "vitest";
import { VisualResponse, normalizeVisualResponse } from "../visual-response";
import type { AudioBands } from "../audio";

const source = (): AudioBands => ({
  bass: 0.2,
  mid: 0.3,
  high: 0.4,
  centroid: 0.6,
  onsetStrength: 0.2,
  bpm: 120,
  bpmConfidence: 0.9,
  beatPhase: 0.4,
  beat: true,
  signalSwing: true,
  bpmLocked: true,
  bins: new Uint8Array([0, 32, 64, 128, 255]),
  fftReadAt: 123,
  timing: {
    readCpuMs: 1,
    audioToRenderMs: 2,
    baseLatencyMs: 3,
    outputLatencyMs: 4,
    fftWindowMs: 5,
    signalChangeAt: 120,
    bassDelta: 0.1,
  },
});

describe("visual response", () => {
  it("changes both spectrum and bands without touching detector input or timing", () => {
    const input = source();
    const original = source();
    const target = { ...input };
    new VisualResponse().apply(input, target, 2);
    expect(input).toEqual(original);
    expect(target.bass).toBe(0.4);
    expect(target.high).toBe(0.8);
    expect([...target.bins]).toEqual([0, 64, 128, 255, 255]);
    expect(target.bpm).toBe(120);
    expect(target.beatPhase).toBe(0.4);
    expect(target.beat).toBe(true);
    expect(target.centroid).toBe(0.6);
    expect(target.timing).toBe(input.timing);
  });
  it("has an exact neutral bypass and reuses storage while adjusting", () => {
    const input = source();
    const target = { ...input };
    const response = new VisualResponse();
    response.apply(input, target, 1);
    expect(target).toEqual(input);
    response.apply(input, target, 0.5);
    const buffer = target.bins;
    response.apply(input, target, 2);
    expect(target.bins).toBe(buffer);
    response.apply(input, target, 1);
    expect(target.bins).toBe(input.bins);
    input.bins = new Uint8Array(8);
    response.apply(input, target, 2);
    expect(target.bins).toHaveLength(8);
  });
  it("drops the waveform when the next source has none", () => {
    const response = new VisualResponse();
    const target = source();
    const live = { ...source(), wave: new Uint8Array(4), kick: 0.5 };
    response.apply(
      { ...live, stereo: { left: new Uint8Array(4), right: new Uint8Array(4) } },
      target,
      1,
    );
    expect(target.wave).toBe(live.wave);
    expect(target.stereo).toBeDefined();

    // The synthetic ambient source carries no waveform at all.
    response.apply(source(), target, 1);
    expect(target.wave).toBeUndefined();
    expect(target.stereo).toBeUndefined();
    expect(target.kick).toBeUndefined();
  });

  it("normalizes corrupt persisted values", () => {
    expect(normalizeVisualResponse(NaN)).toBe(1);
    expect(normalizeVisualResponse(Infinity)).toBe(1);
    expect(normalizeVisualResponse(100)).toBe(4);
    expect(normalizeVisualResponse(0)).toBe(0.25);
  });

  it("shows the fast-attack spectrum when present, leaving detector fields alone", () => {
    const input = source();
    input.display = {
      bass: 0.5,
      mid: 0.25,
      high: 0.1,
      centroid: 0.3,
      bins: new Uint8Array([10, 20, 30, 40, 50]),
    };
    const target = { ...source() };
    const response = new VisualResponse();
    response.apply(input, target, 1);
    expect([target.bass, target.mid, target.high, target.centroid]).toEqual([0.5, 0.25, 0.1, 0.3]);
    expect(target.bins).toBe(input.display.bins);
    // Detector-facing values are untouched on the source.
    expect(input.bass).toBe(0.2);
    expect([...input.bins]).toEqual([0, 32, 64, 128, 255]);

    response.apply(input, target, 2);
    expect(target.bass).toBe(1);
    expect([...target.bins]).toEqual([20, 40, 60, 80, 100]);
    expect([...input.display.bins]).toEqual([10, 20, 30, 40, 50]);
  });
});
