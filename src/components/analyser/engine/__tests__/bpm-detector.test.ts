import { describe, expect, it } from "vitest";

import { BPMDetector } from "../bpm-detector";

function feedPulseTrain(detector: BPMDetector, intervalMs: number, totalMs: number) {
  for (let t = 0; t <= totalMs; t += 50) {
    const phase = (t % intervalMs) / intervalMs;
    const energy = phase < 0.2 ? 0.25 + phase * 3.2 : phase < 0.4 ? 0.89 - (phase - 0.2) * 3 : 0.12;
    detector.feed(energy, t);
    detector.tick(t);
  }
}

describe("BPMDetector", () => {
  it("stabilizes near a 120 BPM pulse train", () => {
    const detector = new BPMDetector();

    feedPulseTrain(detector, 500, 10000);

    let bpm = 0;
    for (let i = 0; i < 40; i++) bpm = detector.tick(10000 + i * 250).bpm;

    expect(bpm).toBeGreaterThan(100);
    expect(bpm).toBeLessThan(130);
    expect(detector.getConfidence()).toBeGreaterThan(0.5);
  });

  it("keeps BPM in a sane bounded range", () => {
    const detector = new BPMDetector();

    feedPulseTrain(detector, 200, 9000);

    let bpm = 0;
    for (let i = 0; i < 40; i++) bpm = detector.tick(10000 + i * 250).bpm;

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
    expect(detector.getBeatPhase()).toBe(0);
  });

  it("autocorrelation detects 120 BPM within ±5 BPM", () => {
    const detector = new BPMDetector();

    feedPulseTrain(detector, 500, 12000);

    let bpm = 0;
    for (let i = 0; i < 40; i++) bpm = detector.tick(12000 + i * 250).bpm;

    expect(bpm).toBeGreaterThanOrEqual(115);
    expect(bpm).toBeLessThanOrEqual(125);
  });

  it("autocorrelation detects 140 BPM within ±5 BPM", () => {
    const detector = new BPMDetector();
    const intervalMs = 60000 / 140;

    feedPulseTrain(detector, intervalMs, 12000);

    let bpm = 0;
    for (let i = 0; i < 40; i++) bpm = detector.tick(12000 + i * 250).bpm;

    expect(bpm).toBeGreaterThanOrEqual(135);
    expect(bpm).toBeLessThanOrEqual(145);
  });

  it("exposes beatPhase in tick result when tempo is stable", () => {
    const detector = new BPMDetector();

    feedPulseTrain(detector, 500, 10000);

    const { beatPhase, confidence } = detector.tick(10000);
    expect(confidence).toBeGreaterThan(0.5);
    expect(beatPhase).toBeGreaterThanOrEqual(0);
    expect(beatPhase).toBeLessThan(1);
  });

  it("locks BPM after stable detection and resists drift", () => {
    const detector = new BPMDetector();
    feedPulseTrain(detector, 500, 12000);

    let locked = false;
    for (let i = 0; i < 60; i++) {
      const result = detector.tick(12000 + i * 250);
      if (result.bpmLocked) locked = true;
    }
    expect(locked).toBe(true);

    const lockedBpm = detector.getBPM();
    feedPulseTrain(detector, 520, 4000);
    for (let i = 0; i < 20; i++) detector.tick(16000 + i * 250);
    expect(Math.abs(detector.getBPM() - lockedBpm)).toBeLessThan(8);
  });

  it("learns BPM from manual tap hints", () => {
    const detector = new BPMDetector();
    const interval = 500;
    for (let i = 0; i < 5; i++) {
      detector.hintBeat(i * interval, i === 0);
    }
    expect(detector.isLocked()).toBe(true);
    expect(detector.isTapLocked()).toBe(true);
    expect(detector.getBPM()).toBeGreaterThanOrEqual(115);
    expect(detector.getBPM()).toBeLessThanOrEqual(125);
    expect(detector.tick(2000).beatPhase).toBe(0);
  });

  it("updates beat phase every tick, not only on analysis frames", () => {
    const detector = new BPMDetector();
    for (let i = 0; i < 5; i++) {
      detector.hintBeat(i * 500, i === 0);
    }
    const a = detector.tick(2100).beatPhase;
    const b = detector.tick(2200).beatPhase;
    expect(b).toBeGreaterThan(a);
    expect(b - a).toBeGreaterThan(0.01);
  });

  it("locks tempo from downbeat hint using fallback BPM", () => {
    const detector = new BPMDetector();
    detector.hintBeat(1000, true, 120);
    expect(detector.isLocked()).toBe(true);
    expect(detector.isTapLocked()).toBe(true);
    expect(detector.getBPM()).toBeGreaterThanOrEqual(115);
    expect(detector.getBPM()).toBeLessThanOrEqual(125);
    expect(detector.tick(1000).beatPhase).toBe(0);
  });

  it("keeps tap-locked tempo after manual taps stop", () => {
    const detector = new BPMDetector();
    const interval = 500;
    for (let i = 0; i < 5; i++) {
      detector.hintBeat(i * interval, i === 0);
    }
    const tappedBpm = detector.getBPM();

    // Contradicting slower audio should not unlock or drift tap tempo.
    feedPulseTrain(detector, 667, 10000);
    for (let i = 0; i < 40; i++) {
      detector.tick(5000 + i * 250);
    }

    expect(detector.isTapLocked()).toBe(true);
    expect(detector.isLocked()).toBe(true);
    expect(Math.abs(detector.getBPM() - tappedBpm)).toBeLessThan(2);
    expect(detector.getConfidence()).toBeGreaterThan(0.85);
  });
});
