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
  it("normalizes corrupt persisted values", () => {
    expect(normalizeVisualResponse(NaN)).toBe(1);
    expect(normalizeVisualResponse(Infinity)).toBe(1);
    expect(normalizeVisualResponse(100)).toBe(4);
    expect(normalizeVisualResponse(0)).toBe(0.25);
  });
});
