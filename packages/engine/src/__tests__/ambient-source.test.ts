import { describe, expect, it } from "vitest";

import { AmbientSource } from "../ambient-source";

describe("AmbientSource", () => {
  it("reports a locked steady tempo the SongClock can adopt", () => {
    const source = new AmbientSource(120);
    const bands = source.read(1000);
    expect(bands.bpm).toBe(120);
    expect(bands.bpmLocked).toBe(true);
    expect(bands.bpmConfidence).toBeGreaterThan(0.8);
  });

  it("fires the beat flag exactly once per beat period", () => {
    const source = new AmbientSource(120); // 500ms per beat
    let beats = 0;
    // 4 seconds at ~60fps from t=0 → beat index increments 8 times, plus the
    // initial frame counts as entering beat 0.
    for (let ms = 0; ms <= 4000; ms += 16) {
      if (source.read(ms).beat) beats += 1;
    }
    expect(beats).toBe(9);
  });

  it("keeps every band and the spectrum inside range, with real energy", () => {
    // Fixed seed: the energy arc varies per session seed, and this test's
    // assertions are about the seeded shape, not the random draw.
    const source = new AmbientSource(110, 1.2);
    let maxBass = 0;
    let binEnergy = 0;
    for (let ms = 0; ms <= 8000; ms += 33) {
      const bands = source.read(ms);
      for (const v of [bands.bass, bands.mid, bands.high, bands.centroid, bands.beatPhase]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      maxBass = Math.max(maxBass, bands.bass);
      binEnergy = Math.max(binEnergy, Math.max(...bands.bins));
    }
    // Kicks must actually hit and the synthetic spectrum must light up.
    expect(maxBass).toBeGreaterThan(0.5);
    expect(binEnergy).toBeGreaterThan(80);
  });

  it("breathes across sections — breakdowns are quieter than peaks", () => {
    const source = new AmbientSource(120, 1.2);
    const beatMs = 500;
    // Average bass over a groove section (section 0) vs a breakdown
    // (section 3 = beats 96..127).
    const avg = (fromBeat: number, toBeat: number) => {
      let sum = 0;
      let n = 0;
      for (let ms = fromBeat * beatMs; ms < toBeat * beatMs; ms += 33) {
        sum += source.read(ms).bass;
        n += 1;
      }
      return sum / n;
    };
    const groove = avg(0, 32);
    const breakdown = avg(96, 128);
    expect(breakdown).toBeLessThan(groove);
  });

  it("restarts from beat one after reset", () => {
    const source = new AmbientSource(100);
    source.read(0);
    source.read(10_000);
    source.reset();
    const bands = source.read(20_000);
    expect(bands.beatPhase).toBeLessThan(0.05);
    expect(bands.beat).toBe(true);
  });
});
