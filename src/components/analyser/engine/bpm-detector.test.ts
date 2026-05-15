import { describe, expect, it } from "vitest";

import { BPMDetector } from "./bpm-detector";

function feedPulseTrain(detector: BPMDetector, intervalMs: number, totalMs: number) {
  for (let t = 0; t <= totalMs; t += 50) {
    const phase = (t % intervalMs) / intervalMs;
    const energy = phase < 0.2 ? 0.25 + phase * 3.2 : phase < 0.4 ? 0.89 - (phase - 0.2) * 3 : 0.12;
    detector.feed(energy, t);
  }
}

describe("BPMDetector", () => {
  it("stabilizes near a 120 BPM pulse train", () => {
    const detector = new BPMDetector();

    feedPulseTrain(detector, 500, 10000);

    let bpm = 0;
    for (let i = 0; i < 40; i++) bpm = detector.getBPM();

    expect(bpm).toBeGreaterThan(100);
    expect(bpm).toBeLessThan(130);
    expect(detector.getConfidence()).toBeGreaterThan(0.5);
  });

  it("keeps BPM in a sane bounded range", () => {
    const detector = new BPMDetector();

    feedPulseTrain(detector, 200, 9000);

    let bpm = 0;
    for (let i = 0; i < 40; i++) bpm = detector.getBPM();

    expect(bpm).toBeGreaterThanOrEqual(60);
    expect(bpm).toBeLessThanOrEqual(200);
  });

  it("resets history and confidence", () => {
    const detector = new BPMDetector();

    feedPulseTrain(detector, 500, 5000);
    detector.getBPM();
    expect(detector.getConfidence()).toBeGreaterThan(0);

    detector.reset();

    expect(detector.getBPM()).toBe(0);
    expect(detector.getConfidence()).toBe(0);
  });
});
