import { describe, expect, it } from "vitest";
import { decodeCountryOutlines, decodeTopoArcs, lonLatToXyz, stepBounce } from "../globe-data";
import { displayLevel, logBin } from "../types";

const topology = {
  transform: { scale: [0.5, 0.25], translate: [-180, -90] },
  arcs: [
    [
      [10, 20],
      [2, 4],
      [-4, 8],
    ],
    [
      [100, 100],
      [10, 0],
    ],
  ],
  objects: {
    countries: {
      geometries: [
        { type: "Polygon", arcs: [[0]] },
        // Shares arc 0 reversed (~0 = -1) and adds arc 1.
        { type: "MultiPolygon", arcs: [[[-1]], [[1]]] },
      ],
    },
  },
};

describe("globe map decoding", () => {
  it("delta-decodes arcs through the quantising transform", () => {
    const arcs = decodeTopoArcs(topology);
    // Points: (-175,-85) → (-174,-84) → (-176,-82).
    expect([...arcs[0]!]).toEqual([-175, -85, -174, -84, -176, -82]);
    expect([...arcs[1]!]).toEqual([-130, -65, -125, -65]);
  });

  it("drops a malformed arc whole and tolerates a non-topology payload", () => {
    const arcs = decodeTopoArcs({
      arcs: [
        "nope",
        [
          [0, 0],
          [null, 1],
          [5, 5],
        ],
      ],
    });
    expect(arcs.map((arc) => arc.length)).toEqual([0, 0]);
    expect(decodeTopoArcs(null)).toEqual([]);
    expect(decodeTopoArcs({ arcs: 3 })).toEqual([]);
  });

  it("emits a shared border once per country so neighbours move independently", () => {
    const outlines = decodeCountryOutlines(topology);
    expect(outlines.countryCount).toBe(2);
    // Country 0: arc 0 (2 segments). Country 1: arc 0 again + arc 1 (3 segments).
    expect(outlines.segments).toHaveLength(5 * 4);
    expect([...outlines.owners]).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 1, 1]);
    expect([...outlines.segments.slice(0, 4)]).toEqual([-175, -85, -174, -84]);
  });

  it("skips countries with nothing drawable and honours the country cap", () => {
    const sparse = {
      ...topology,
      objects: {
        countries: {
          geometries: [{ arcs: [[99]] }, { arcs: "bad" }, null, { arcs: [[1]] }, { arcs: [[0]] }],
        },
      },
    };
    const outlines = decodeCountryOutlines(sparse);
    expect(outlines.countryCount).toBe(2);
    expect([...new Set(outlines.owners)]).toEqual([0, 1]);
    expect(decodeCountryOutlines(sparse, 1).countryCount).toBe(1);
    expect(decodeCountryOutlines({}).countryCount).toBe(0);
  });
});

describe("country bounce", () => {
  it("overshoots its target and then settles on it", () => {
    const position = new Float32Array(1);
    const velocity = new Float32Array(1);
    const targets = new Float32Array([1]);
    let peak = 0;
    for (let i = 0; i < 600; i++) {
      stepBounce(position, velocity, targets, 1, 1 / 120);
      peak = Math.max(peak, position[0]!);
    }
    expect(peak).toBeGreaterThan(1.05);
    expect(position[0]).toBeCloseTo(1, 2);
    expect(Math.abs(velocity[0]!)).toBeLessThan(0.01);
  });

  it("stays bounded through a long stalled frame", () => {
    const position = new Float32Array(1);
    const velocity = new Float32Array([8]);
    const targets = new Float32Array([0.5]);
    for (let i = 0; i < 200; i++) stepBounce(position, velocity, targets, 1, 2);
    expect(Number.isFinite(position[0]!)).toBe(true);
    expect(Math.abs(position[0]! - 0.5)).toBeLessThan(0.05);
  });
});

describe("view helpers", () => {
  it("places lon/lat on the sphere with north up and lon 0 facing +Z", () => {
    const p = { x: 0, y: 0, z: 0 };
    lonLatToXyz(0, 0, 2, p);
    expect([p.x, p.y, p.z].map((v) => +v.toFixed(6))).toEqual([0, 0, 2]);
    lonLatToXyz(90, 0, 2, p);
    expect(+p.x.toFixed(6)).toBe(2);
    lonLatToXyz(0, 90, 2, p);
    expect(+p.y.toFixed(6)).toBe(2);
  });

  it("maps columns onto in-range, non-decreasing log-spaced bins", () => {
    const bins = Array.from({ length: 64 }, (_, i) => logBin(i, 64, 1024));
    expect(Math.min(...bins)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...bins)).toBeLessThan(1024);
    expect(bins.every((bin, i) => i === 0 || bin >= bins[i - 1]!)).toBe(true);
    // Log spacing: the top half of the columns covers far more bins than the bottom half.
    expect(bins[63]! - bins[32]!).toBeGreaterThan((bins[31]! - bins[0]!) * 4);
    expect(logBin(3, 8, 1)).toBe(0);
  });

  it("lifts quiet levels without exceeding full scale", () => {
    expect(displayLevel(0)).toBe(0);
    expect(displayLevel(255)).toBe(1);
    expect(displayLevel(32)).toBeGreaterThan(0.3);
    expect(displayLevel(-5)).toBe(0);
  });
});
