/**
 * Grows trees by one recursion, after the forest-world-builder project: a
 * species is only numbers — children per level, their pitch off the parent,
 * lift against gravity, crown outline — and every woody thing is the same
 * rule applied to them.
 *
 * Returns plain typed arrays (no Three.js), so growth is deterministic from
 * its seed and cheap to test.
 */
export type Species = {
  /** Height in metres. */
  height: number;
  /** Trunk radius as a fraction of height. */
  girth: number;
  /** Where up the trunk the crown starts, 0–1. */
  crown: number;
  /** Children at each level. */
  children: readonly number[];
  /** Angle off the parent at each level, radians. */
  pitch: readonly number[];
  /** Upward bend at each level, as a fraction of branch length. */
  lift: readonly number[];
  /** First-level branch length as a fraction of height. */
  spread: number;
  /** Crown outline: branch length multiplier at fraction f up the crown. */
  shape: (f: number) => number;
  /** Child length as a fraction of its parent's. */
  reach: number;
  /** Sideways wander, as a fraction of length. */
  wander: number;
  lean: number;
  /** Level that carries foliage. */
  leafAt: number;
  leavesPerBranch: number;
  leafSize: number;
};

export const SPECIES: Record<"beech" | "birch" | "pine", Species> = {
  beech: {
    height: 20,
    girth: 0.017,
    crown: 0.34,
    children: [8, 3, 2],
    pitch: [0.95, 0.8, 0.7],
    lift: [0, 0.3, 0.2, 0.1],
    spread: 0.34,
    shape: (f) => 0.65 + 0.35 * Math.sin(f * 3.1),
    reach: 0.62,
    wander: 0.12,
    lean: 0.15,
    leafAt: 2,
    leavesPerBranch: 4,
    leafSize: 2.4,
  },
  birch: {
    height: 17,
    girth: 0.009,
    crown: 0.4,
    children: [13, 3],
    pitch: [0.75, 0.9],
    lift: [0, 0.12, -0.5],
    spread: 0.2,
    shape: (f) => 0.6 + 0.4 * Math.sin(f * 3.1),
    reach: 0.6,
    wander: 0.1,
    lean: 0.25,
    leafAt: 1,
    leavesPerBranch: 5,
    leafSize: 1.5,
  },
  pine: {
    height: 27,
    girth: 0.012,
    crown: 0.58,
    children: [14, 3],
    pitch: [1.35, 0.7],
    lift: [0, 0.1, 0.15],
    spread: 0.2,
    shape: (f) => 0.5 + 0.5 * Math.sin(f * 3.1),
    reach: 0.5,
    wander: 0.08,
    lean: 0.12,
    leafAt: 1,
    leavesPerBranch: 5,
    leafSize: 2.0,
  },
};

export type GrownTree = {
  /** Branch segments: start xyz, end xyz, start radius, end radius, level (9 per segment). */
  branches: Float32Array;
  /** Foliage: centre xyz, size (4 per leaf). */
  leaves: Float32Array;
  height: number;
};

/** Deterministic generator so a seed always grows the same tree. */
export function seededRandom(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Vec = [number, number, number];
const add = (a: Vec, b: Vec, k = 1): Vec => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const norm = (a: Vec): Vec => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

export function growTree(species: Species, seed: number): GrownTree {
  const rnd = seededRandom(seed);
  // No two alike: each tree varies its own proportions a little.
  const sp = {
    ...species,
    spread: species.spread * (0.75 + 0.5 * rnd()),
    crown: Math.min(0.8, species.crown * (0.7 + 0.6 * rnd())),
  };
  const height = sp.height * (0.75 + rnd() * 0.5);
  const branches: number[] = [];
  const leaves: number[] = [];

  const grow = (base: Vec, dir: Vec, length: number, radius: number, level: number) => {
    const bend: Vec = [
      (rnd() - 0.5) * length * sp.wander,
      length * (sp.lift[level] ?? 0),
      (rnd() - 0.5) * length * sp.wander,
    ];
    const at = (t: number): Vec => add(add(base, dir, length * t), bend, t * t);
    const radiusAt = (t: number) =>
      level === 0 ? radius * (1 - 0.8 * t) + 0.01 : radius * (1 - 0.85 * t) + 0.004;
    // Two straight pieces follow the bend closely enough at this scale.
    for (const [t0, t1] of [
      [0, 0.5],
      [0.5, 1],
    ] as const) {
      const a = at(t0);
      const b = at(t1);
      branches.push(a[0], a[1], a[2], b[0], b[1], b[2], radiusAt(t0), radiusAt(t1), level);
    }
    const count = sp.children[level] ?? 0;
    for (let i = 0; i < count; i++) {
      const f = (i + rnd()) / count;
      const t = level === 0 ? sp.crown + (1 - sp.crown) * f * 0.97 : 0.25 + 0.75 * f;
      const azimuth = i * 2.4 + rnd();
      let side: Vec = [Math.cos(azimuth), 0, Math.sin(azimuth)];
      side = norm(add(side, dir, -dot(side, dir)));
      const pitch = (sp.pitch[level] ?? 0.8) * (0.8 + 0.4 * rnd());
      const child = norm(
        add(
          [dir[0] * Math.cos(pitch), dir[1] * Math.cos(pitch), dir[2] * Math.cos(pitch)],
          side,
          Math.sin(pitch),
        ),
      );
      const childLength =
        (level === 0 ? height * sp.spread * sp.shape(f) : length * sp.reach) * (0.7 + 0.6 * rnd());
      grow(at(t), child, childLength, Math.max(radiusAt(t) * 0.45, 0.01), level + 1);
    }
    if (level >= sp.leafAt) {
      for (let j = 0; j < sp.leavesPerBranch; j++) {
        const p = at(0.25 + (0.75 * (j + rnd())) / sp.leavesPerBranch);
        leaves.push(
          p[0] + (rnd() - 0.5) * 0.8,
          p[1] + (rnd() - 0.3) * 0.8,
          p[2] + (rnd() - 0.5) * 0.8,
          sp.leafSize * (0.7 + 0.6 * rnd()),
        );
      }
    }
  };

  grow(
    [0, 0, 0],
    norm([(rnd() - 0.5) * sp.lean, 1, (rnd() - 0.5) * sp.lean]),
    height,
    height * sp.girth,
    0,
  );
  return { branches: new Float32Array(branches), leaves: new Float32Array(leaves), height };
}
