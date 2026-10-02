import { describe, expect, it } from "vitest";
import { measureFrame, VisualBalance, type FrameMetrics } from "../visual-balance";
const normal: FrameMetrics = {
  mean: 0.15,
  litMean: 0.35,
  litFraction: 0.4,
  whiteFraction: 0,
  activity: 0.03,
};
const run = (balance: VisualBalance, frame: FrameMetrics, seconds: number, energy = 0.15) => {
  for (let i = 0; i < seconds * 4; i++) balance.tick(frame, 0.25, energy, true);
};

describe("visual balance", () => {
  it("brightens persistently dark content, dims washed-out frames, and stays bounded", () => {
    const dark = new VisualBalance();
    run(dark, { ...normal, litMean: 0.05 }, 8);
    expect(dark.exposure).toBeGreaterThan(1);
    run(dark, { ...normal, litMean: 0.05 }, 120);
    expect(dark.exposure).toBe(1.8);
    const bright = new VisualBalance();
    run(bright, { ...normal, mean: 0.95, whiteFraction: 0.6 }, 8);
    expect(bright.exposure).toBeLessThan(1);
    run(bright, { ...normal, mean: 0.95, whiteFraction: 0.6 }, 120);
    expect(bright.exposure).toBe(0.55);
  });
  it("preserves sparse bright subjects, brief flashes and silence", () => {
    const b = new VisualBalance();
    run(b, { ...normal, mean: 0.01, litMean: 0.5, litFraction: 0.02 }, 20);
    expect(b.exposure).toBe(1);
    run(b, { ...normal, mean: 1, whiteFraction: 1 }, 0.5);
    expect(b.exposure).toBe(1);
    run(b, { ...normal, litMean: 0.03, activity: 0 }, 30, 0);
    expect(b.exposure).toBe(1);
    expect(b.response).toBe(1);
    expect(b.status).toBe("quiet");
  });
  it("boosts response only after sustained stillness with an active signal", () => {
    const b = new VisualBalance();
    run(b, { ...normal, activity: 0 }, 4);
    expect(b.response).toBe(1);
    run(b, { ...normal, activity: 0 }, 8);
    expect(b.response).toBeGreaterThan(1);
    const boosted = b.response;
    run(b, normal, 8);
    expect(b.response).toBeLessThan(boosted);
    b.reset();
    expect(b.response).toBe(1);
    expect(b.exposure).toBe(1);
  });
  it("measures displayed brightness without confusing its own correction with movement", () => {
    const pixels = new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 255]);
    const history = new Float32Array(2);
    const first = measureFrame(pixels, history, 1, false);
    const second = measureFrame(pixels, history, 2, true);
    expect(second.mean).toBeCloseTo(first.mean * 2);
    expect(second.activity).toBeLessThan(0.00001);
    expect(second.litFraction).toBe(0.5);
  });
});
