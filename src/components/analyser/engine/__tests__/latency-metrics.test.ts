import { describe, expect, it } from "vitest";

import {
  isSignalLatencyVisible,
  measureFrameLatency,
  smoothLatency,
} from "../latency-metrics";

describe("measureFrameLatency", () => {
  it("computes pipeline segments from frame timestamps", () => {
    const m = measureFrameLatency({
      fftReadAt: 100,
      tAfterScene: 100.2,
      tAfterRender: 101.5,
      signalSwing: false,
      signalChangeAt: 0,
    });
    expect(m.audioToSceneMs).toBeCloseTo(0.2);
    expect(m.sceneToRenderMs).toBeCloseTo(1.3);
    expect(m.audioToRenderMs).toBeCloseTo(1.5);
    expect(m.signalToRenderMs).toBe(0);
  });

  it("measures signal→ui only on the transient frame", () => {
    const atSwing = measureFrameLatency({
      fftReadAt: 1000,
      tAfterScene: 1000.1,
      tAfterRender: 1001.2,
      signalSwing: true,
      signalChangeAt: 1000,
    });
    expect(atSwing.signalToRenderMs).toBeCloseTo(1.2);

    const later = measureFrameLatency({
      fftReadAt: 2000,
      tAfterScene: 2000.1,
      tAfterRender: 2001.2,
      signalSwing: false,
      signalChangeAt: 1000,
    });
    expect(later.signalToRenderMs).toBe(0);
  });

  it("does not grow signal latency from a stale signalChangeAt", () => {
    const stale = measureFrameLatency({
      fftReadAt: 38_000,
      tAfterScene: 38_000.1,
      tAfterRender: 38_001.3,
      signalSwing: false,
      signalChangeAt: 1000,
    });
    expect(stale.signalToRenderMs).toBe(0);
    expect(stale.audioToRenderMs).toBeCloseTo(1.3);
  });
});

describe("smoothLatency", () => {
  it("EMA-smooths audio→ui every frame", () => {
    const next = smoothLatency(
      { audioToRenderMs: 2, signalToRenderMs: 0 },
      { audioToRenderMs: 4, signalToRenderMs: 0 },
    );
    expect(next.audioToRenderMs).toBeCloseTo(2.3);
    expect(next.signalToRenderMs).toBe(0);
  });

  it("decays signal→ui when no fresh transient", () => {
    const next = smoothLatency(
      { audioToRenderMs: 2, signalToRenderMs: 5 },
      { audioToRenderMs: 2, signalToRenderMs: 0 },
    );
    expect(next.signalToRenderMs).toBeCloseTo(4.25);
  });
});

describe("isSignalLatencyVisible", () => {
  it("hides values below display threshold", () => {
    expect(isSignalLatencyVisible(0.4)).toBe(false);
    expect(isSignalLatencyVisible(0.5)).toBe(true);
  });
});
