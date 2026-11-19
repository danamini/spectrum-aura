import { describe, expect, it } from "vitest";
import { DISPLAY_ATTACK_RETAIN, DisplayBallistics, releaseStep } from "../display-ballistics";

/** AnalyserNode smoothing as the spec defines it: linear magnitude, then dB bytes. */
function analyserBytes(linear: number): number {
  const db = 20 * Math.log10(Math.max(linear, 1e-12));
  return Math.max(0, Math.min(255, (255 * (db + 100)) / 70));
}

describe("display ballistics", () => {
  it("reaches a new level on the frame it arrives", () => {
    const ballistics = new DisplayBallistics();
    const out = ballistics.process(new Uint8Array([200]), 0.82);
    expect(out[0]).toBeGreaterThanOrEqual(200 * (1 - DISPLAY_ATTACK_RETAIN) - 1);
    expect(ballistics.process(new Uint8Array([200]), 0.82)[0]).toBeGreaterThanOrEqual(190);
  });

  it("releases at the slope analyser smoothing gives the same slider value", () => {
    for (const smoothing of [0.45, 0.82, 0.95]) {
      const ballistics = new DisplayBallistics();
      const loud = new Uint8Array([analyserBytes(0.01)]);
      for (let i = 0; i < 20; i++) ballistics.process(loud, smoothing);
      // Reference: the analyser's own decay to silence from the same level.
      let linear = 0.01;
      const silence = new Uint8Array([0]);
      for (let frame = 1; frame <= 12; frame++) {
        linear *= smoothing;
        const shown = ballistics.process(silence, smoothing)[0]!;
        expect(Math.abs(shown - analyserBytes(linear))).toBeLessThanOrEqual(2);
      }
    }
  });

  it("never falls below the incoming level and never rises on its own", () => {
    const ballistics = new DisplayBallistics();
    ballistics.process(new Uint8Array([255, 0]), 0.9);
    const out = ballistics.process(new Uint8Array([180, 0]), 0.9);
    expect(out[0]).toBeGreaterThanOrEqual(180);
    expect(out[1]).toBe(0);
  });

  it("treats zero smoothing as an instant release and tracks bin-count changes", () => {
    expect(releaseStep(0)).toBe(255);
    const ballistics = new DisplayBallistics();
    ballistics.process(new Uint8Array([255, 255]), 0);
    expect([...ballistics.process(new Uint8Array([10, 20]), 0)]).toEqual([10, 20]);
    expect(ballistics.process(new Uint8Array(8), 0.8)).toHaveLength(8);
  });
});
