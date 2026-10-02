import { describe, expect, it } from "vitest";
import {
  pushStatsHistory,
  nextSparklineRange,
  sparklinePoints,
  STATS_HISTORY_LENGTH,
} from "../overlays/stats-history";

describe("stats trends", () => {
  it("damps a spike without changing source samples and keeps a bounded window", () => {
    const history = [0];
    pushStatsHistory(history, 1);
    expect(history.at(-1)).toBeCloseTo(0.65);
    pushStatsHistory(history, 1);
    expect(history.at(-1)).toBeCloseTo(0.8775);
    for (let i = 0; i < 100; i++) pushStatsHistory(history, 1);
    expect(history).toHaveLength(STATS_HISTORY_LENGTH);
    expect(history.at(-1)).toBeCloseTo(1);
  });
  it("shows small variations without changing scale abruptly", () => {
    const first = nextSparklineRange([0.61, 0.64, 0.63], null, 0.04);
    const points = sparklinePoints([0.61, 0.64, 0.63], first);
    const ys = points.split(" ").map((p) => Number(p.split(",")[1]));
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
    const next = nextSparklineRange([0.62, 0.63, 0.625], first, 0.04);
    expect(Math.abs(next.min - first.min)).toBeLessThan(0.002);
    expect(Math.abs(next.max - first.max)).toBeLessThan(0.002);
  });
  it("contracts gradually after an outlier leaves the window", () => {
    const previous = { min: 0, max: 1 };
    const next = nextSparklineRange([0.5, 0.51], previous, 0.04);
    expect(next.max - next.min).toBeGreaterThan(0.9);
    expect(next.max - next.min).toBeLessThan(1);
  });
  it("right-aligns new samples instead of stretching a growing history", () => {
    expect(sparklinePoints([0, 1], { min: 0, max: 1 })).toBe("71.57,19.00 73.00,1.00");
    expect(sparklinePoints([0, 0.5, 1], { min: 0, max: 1 })).toContain("71.57,10.00 73.00,1.00");
  });
});
