import { describe, expect, it } from "vitest";

import { BPMDetector, isOctaveMismatch } from "../bpm-detector";

function feedPulseTrain(detector: BPMDetector, intervalMs: number, totalMs: number) {
  for (let t = 0; t <= totalMs; t += 50) {
    const phase = (t % intervalMs) / intervalMs;
    const energy = phase < 0.2 ? 0.25 + phase * 3.2 : phase < 0.4 ? 0.89 - (phase - 0.2) * 3 : 0.12;
    detector.feed(energy, t);
    detector.tick(t);
  }
}

describe("isOctaveMismatch", () => {
  it("recognizes a clean 2x/0.5x match", () => {
    expect(isOctaveMismatch(80, 160)).toBe(true);
    expect(isOctaveMismatch(160, 80)).toBe(true);
  });

  it("rejects a generic tempo difference", () => {
    expect(isOctaveMismatch(120, 140)).toBe(false);
    expect(isOctaveMismatch(120, 90)).toBe(false);
  });

  it("tolerates small measurement jitter around the exact multiple", () => {
    expect(isOctaveMismatch(100, 198)).toBe(true);
    expect(isOctaveMismatch(100, 215)).toBe(false);
  });

  it("treats non-positive input as no match", () => {
    expect(isOctaveMismatch(0, 120)).toBe(false);
    expect(isOctaveMismatch(120, 0)).toBe(false);
  });
});

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

    // Feed a slightly-off (520ms ≈ 115 BPM) pulse train with *forward*
    // timestamps — backwards ones are silently dropped by the feed-interval
    // guard, which once left this half of the test asserting nothing.
    const lockedBpm = detector.getBPM();
    let t = 27000;
    for (let i = 0; i < 120; i++) {
      const phase = (t % 520) / 520;
      const energy =
        phase < 0.2 ? 0.25 + phase * 3.2 : phase < 0.4 ? 0.89 - (phase - 0.2) * 3 : 0.12;
      detector.feed(energy, t);
      detector.tick(t);
      t += 50;
    }
    // Within the locked agreement band, drift only nudges the lock slowly.
    expect(Math.abs(detector.getBPM() - lockedBpm)).toBeLessThan(4);
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

  it("releaseManualLock lets fresh audio re-acquire BPM after a tap-lock", () => {
    const detector = new BPMDetector();
    const interval = 500; // ~120 BPM
    for (let i = 0; i < 5; i++) {
      detector.hintBeat(i * interval, i === 0);
    }
    expect(detector.isTapLocked()).toBe(true);
    expect(detector.isLocked()).toBe(true);

    detector.releaseManualLock();
    expect(detector.isTapLocked()).toBe(false);
    expect(detector.isLocked()).toBe(false);

    // A genuinely different tempo should now be able to win — proving the
    // detector isn't just silently discarding fresh candidates anymore (the
    // old tapLocked early-return in applyBpmLock would have kept it at 120).
    feedPulseTrain(detector, 353, 8000); // ~170 BPM, feeds/ticks t = 0..8000 internally
    let t = 8000;
    for (let i = 0; i < 20; i++) {
      t += 250;
      detector.tick(t);
    }
    expect(detector.getBPM()).toBeGreaterThan(150);
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

  it("decays tap-locked confidence during real silence instead of staying pinned", () => {
    const detector = new BPMDetector();
    const interval = 500;
    for (let i = 0; i < 5; i++) {
      detector.hintBeat(i * interval, i === 0);
    }
    expect(detector.getConfidence()).toBeGreaterThanOrEqual(0.88);

    // Feed genuinely-silent bands (near-zero, well below even a quiet real
    // track's level) well past the decay grace period, advancing time without
    // ever refreshing "last active" state. The activity floor is now relative
    // to a slow-moving average rather than a fixed constant (see
    // SILENCE_RELATIVE_RATIO) — quiet-but-real music must NOT decay
    // confidence, only true silence should.
    let time = 2000;
    for (let i = 0; i < 80; i++) {
      time += 50;
      detector.feedBands({ bass: 0.001, mid: 0.0005, high: 0.0002 }, time);
      detector.tick(time);
    }

    expect(detector.getConfidence()).toBeLessThan(0.5);
    // Silence must not change the lock itself, only the confidence readout.
    expect(detector.isTapLocked()).toBe(true);
    expect(detector.isLocked()).toBe(true);
  });

  it("does not falsely decay confidence on quiet-but-real audio (regression: real mic/tab capture is much quieter than a loud synthetic signal)", () => {
    const detector = new BPMDetector();
    const interval = 500; // 120 BPM
    let time = 0;
    const totalMs = 20000;
    while (time <= totalMs) {
      const phase = (time % interval) / interval;
      const loud = phase < 0.2 ? 0.25 + phase * 3.2 : phase < 0.4 ? 0.89 - (phase - 0.2) * 3 : 0.12;
      // Scaled down ~40x — peak ~0.022, always below the old fixed 0.04
      // "silence" threshold this fix replaced.
      const energy = loud / 40;
      detector.feed(energy, time);
      detector.tick(time);
      time += 50;
    }
    expect(detector.isLocked()).toBe(true);
    expect(detector.getConfidence()).toBeGreaterThan(0.85);
  });

  it("corrects an auto-locked half-tempo octave error once double-speed audio persists", () => {
    const detector = new BPMDetector();
    // Lock onto a slow ~85 BPM pulse train (auto-lock, not tap-lock). Deliberately
    // inside (80, 90) so neither this nor its double (~170) hits the existing
    // extreme clampBpm correction (<80 doubles, >180 halves) — isolates the new
    // mid-range octave-correction path from the pre-existing extreme one.
    const slowInterval = 706; // ~85 BPM
    feedPulseTrain(detector, slowInterval, 8000);
    expect(detector.isLocked()).toBe(true);
    expect(detector.isTapLocked()).toBe(false);
    const halfBpm = detector.getBPM();
    expect(halfBpm).toBeGreaterThan(80);
    expect(halfBpm).toBeLessThan(90);

    // Now feed genuinely double-speed audio for several seconds.
    const fastInterval = slowInterval / 2;
    let time = 8000;
    let bpm = halfBpm;
    for (let i = 0; i < 300; i++) {
      time += 50;
      const phase = (time % fastInterval) / fastInterval;
      const energy =
        phase < 0.2 ? 0.25 + phase * 3.2 : phase < 0.4 ? 0.89 - (phase - 0.2) * 3 : 0.12;
      detector.feed(energy, time);
      bpm = detector.tick(time).bpm;
    }

    expect(Math.abs(bpm - halfBpm * 2)).toBeLessThan(8);
  });

  it("does not decay confidence while real signal keeps arriving", () => {
    const detector = new BPMDetector();
    feedPulseTrain(detector, 500, 10000);
    const confidenceRightAfterFeed = detector.getConfidence();
    expect(confidenceRightAfterFeed).toBeGreaterThan(0.5);

    // A few more ticks at the same instant as the last feed — no silence has
    // elapsed, so confidence should be unchanged (within analysis noise).
    const { confidence } = detector.tick(10000);
    expect(confidence).toBeCloseTo(confidenceRightAfterFeed, 1);
  });
});
