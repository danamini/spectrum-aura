import { describe, expect, it } from "vitest";
import {
  NeedleBallistics,
  SEVEN_SEGMENT,
  VU_SCALE,
  bandPeak,
  findPeaks,
  formatHz,
  formatWavelength,
  nearestNote,
  vuPosition,
  waveLevels,
  reelRadii,
} from "../instrument-math";

describe("instrument readouts", () => {
  it("formats frequency in the unit a person would read", () => {
    expect(formatHz(62.4)).toBe("62 Hz");
    expect(formatHz(1240)).toBe("1.24 kHz");
    expect(formatHz(12500)).toBe("12.5 kHz");
    expect(formatHz(0)).toBe("--");
    expect(formatHz(Number.NaN)).toBe("--");
  });

  it("gives wavelength in air at 343 m/s", () => {
    expect(formatWavelength(34.3)).toBe("10.00 m");
    expect(formatWavelength(1000)).toBe("34.3 cm");
    expect(formatWavelength(68600)).toBe("5.0 mm");
    expect(formatWavelength(0)).toBe("--");
  });

  it("names the nearest note and its offset in cents", () => {
    expect(nearestNote(440)).toEqual({ name: "A4", cents: 0 });
    expect(nearestNote(261.63)?.name).toBe("C4");
    expect(nearestNote(41.2)?.name).toBe("E1");
    // A quarter-tone sharp of A4 rounds to +50 or the next note at -50.
    expect(Math.abs(nearestNote(440 * 2 ** (0.3 / 12))!.cents)).toBe(30);
    expect(nearestNote(0)).toBeNull();
  });
});

describe("peak picking", () => {
  it("returns the strongest separated maxima, strongest first", () => {
    const levels = new Float32Array(40);
    levels[5] = 0.9;
    levels[7] = 0.8; // too close to 5
    levels[20] = 0.6;
    levels[33] = 0.7;
    const out: number[] = [];
    expect(findPeaks(levels, out, 4, 6, 0.3)).toBe(3);
    expect(out.slice(0, 3)).toEqual([5, 33, 20]);
  });

  it("ignores everything under the minimum level", () => {
    const out: number[] = [];
    expect(findPeaks(new Float32Array(20).fill(0.1), out, 4, 2, 0.3)).toBe(0);
  });

  it("takes the strongest bin near a band centre", () => {
    const bins = new Uint8Array(1024);
    bins[43] = 200; // 43 × 23.4 Hz ≈ 1008 Hz
    expect(bandPeak(bins, 23.4375, 1000)).toBe(200);
    expect(bandPeak(bins, 23.4375, 4000)).toBe(0);
    expect(bandPeak(new Uint8Array(0), 23.4375, 1000)).toBe(0);
  });
});

describe("needle ballistics", () => {
  it("swings to the target with a little overshoot and settles", () => {
    const needle = new NeedleBallistics();
    let max = 0;
    for (let i = 0; i < 120; i++) max = Math.max(max, needle.step(0.7, 1 / 60));
    expect(max).toBeGreaterThan(0.7);
    expect(max).toBeLessThan(0.8);
    expect(needle.position).toBeCloseTo(0.7, 2);
  });

  it("takes time to rise, so a single frame cannot peg the needle", () => {
    const needle = new NeedleBallistics();
    expect(needle.step(1, 1 / 60)).toBeLessThan(0.1);
  });

  it("stays on the dial through long frames and wild targets", () => {
    const needle = new NeedleBallistics();
    for (const target of [50, -50, 1, 0, 9]) {
      for (let i = 0; i < 30; i++) {
        const at = needle.step(target, 5);
        expect(at).toBeGreaterThanOrEqual(-0.04);
        expect(at).toBeLessThanOrEqual(1.04);
      }
    }
  });
});

describe("VU scale", () => {
  it("places 0 VU at 70% and is monotonic", () => {
    expect(vuPosition(-40)).toBe(0);
    expect(vuPosition(0)).toBeCloseTo(0.7);
    expect(vuPosition(9)).toBe(1);
    let last = -1;
    for (let db = -20; db <= 3; db += 0.25) {
      const at = vuPosition(db);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
    for (const [db, at] of VU_SCALE) expect(vuPosition(db)).toBeCloseTo(at);
  });
});

describe("waveform levels", () => {
  it("reads a full-scale square as about 0 dBFS with no crest", () => {
    const wave = new Uint8Array(512).map((_, i) => (i % 2 ? 255 : 1));
    const out = { rmsDb: 0, peakDb: 0 };
    waveLevels(wave, out);
    expect(out.rmsDb).toBeCloseTo(-0.07, 1);
    expect(out.peakDb - out.rmsDb).toBeCloseTo(0, 1);
  });

  it("reads silence as minus infinity", () => {
    const out = { rmsDb: 0, peakDb: 0 };
    waveLevels(new Uint8Array(256).fill(128), out);
    expect(out.rmsDb).toBe(-Infinity);
    waveLevels(new Uint8Array(0), out);
    expect(out.peakDb).toBe(-Infinity);
  });
});

describe("seven-segment table", () => {
  it("lights seven segments for 8 and two for 1", () => {
    const count = (mask: number) => mask.toString(2).replace(/0/g, "").length;
    expect(count(SEVEN_SEGMENT["8"]!)).toBe(7);
    expect(count(SEVEN_SEGMENT["1"]!)).toBe(2);
    for (const digit of "0123456789") expect(SEVEN_SEGMENT[digit]).toBeGreaterThan(0);
  });
});

describe("reelRadii", () => {
  it("moves tape from one pack to the other without losing any", () => {
    const out = { supply: 0, takeUp: 0 };
    reelRadii(0, 50, 130, out);
    expect(out).toEqual({ supply: 130, takeUp: 50 });
    reelRadii(1, 50, 130, out);
    expect(out.supply).toBeCloseTo(50);
    expect(out.takeUp).toBeCloseTo(130);
    reelRadii(0.5, 50, 130, out);
    // Half way the packs match, and the total wound area is unchanged.
    expect(out.supply).toBeCloseTo(out.takeUp);
    expect(out.supply ** 2 + out.takeUp ** 2).toBeCloseTo(50 ** 2 + 130 ** 2);
  });

  it("clamps out-of-range progress", () => {
    const out = { supply: 0, takeUp: 0 };
    reelRadii(-2, 50, 130, out);
    expect(out.supply).toBe(130);
    reelRadii(9, 50, 130, out);
    expect(out.takeUp).toBeCloseTo(130);
  });
});
