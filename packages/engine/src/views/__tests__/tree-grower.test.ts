import { describe, expect, it } from "vitest";
import { SPECIES, growTree, seededRandom } from "../tree-grower";

describe("tree grower", () => {
  it("grows the same tree from the same seed and a different one from another", () => {
    const a = growTree(SPECIES.beech, 11);
    const b = growTree(SPECIES.beech, 11);
    const c = growTree(SPECIES.beech, 12);
    expect([...a.branches]).toEqual([...b.branches]);
    expect([...a.leaves]).toEqual([...b.leaves]);
    expect([...a.branches]).not.toEqual([...c.branches]);
  });

  it.each(Object.keys(SPECIES) as Array<keyof typeof SPECIES>)(
    "grows a plausible %s: rooted, upright, finite and within its species' size",
    (name) => {
      const species = SPECIES[name];
      for (const seed of [1, 7, 23, 99]) {
        const tree = growTree(species, seed);
        const b = tree.branches;
        expect(b.length % 9).toBe(0);
        expect(tree.leaves.length % 4).toBe(0);
        expect([...b].every(Number.isFinite)).toBe(true);
        expect([...tree.leaves].every(Number.isFinite)).toBe(true);
        // The trunk starts at the origin and climbs.
        expect([b[0], b[1], b[2]]).toEqual([0, 0, 0]);
        expect(b[4]!).toBeGreaterThan(0);
        expect(tree.height).toBeGreaterThanOrEqual(species.height * 0.75);
        expect(tree.height).toBeLessThanOrEqual(species.height * 1.25);
        // Nothing wanders absurdly far from the stem.
        let reach = 0;
        for (let i = 0; i < b.length; i += 9)
          reach = Math.max(reach, Math.hypot(b[i + 3]!, b[i + 5]!));
        expect(reach).toBeLessThan(tree.height * 1.2);
        expect(tree.leaves.length).toBeGreaterThan(0);
      }
    },
  );

  it("follows the species' branching numbers", () => {
    // Two segments per branch; a beech has 1 trunk + 8 + 8·3 + 8·3·2 branches.
    const beech = growTree(SPECIES.beech, 3);
    expect(beech.branches.length / 9).toBe(2 * (1 + 8 + 24 + 48));
    // Foliage from the leaf level outward: 24 + 48 branches, 4 leaves each.
    expect(beech.leaves.length / 4).toBe((24 + 48) * SPECIES.beech.leavesPerBranch);
    const birch = growTree(SPECIES.birch, 3);
    expect(birch.branches.length / 9).toBe(2 * (1 + 13 + 39));
  });

  it("thins branches with each level", () => {
    const tree = growTree(SPECIES.beech, 5);
    const widest = [0, 0, 0, 0];
    for (let i = 0; i < tree.branches.length; i += 9) {
      const level = tree.branches[i + 8]!;
      widest[level] = Math.max(widest[level]!, tree.branches[i + 6]!);
    }
    expect(widest[0]!).toBeGreaterThan(widest[1]!);
    expect(widest[1]!).toBeGreaterThan(widest[2]!);
    expect(widest[2]!).toBeGreaterThan(widest[3]!);
  });

  it("seeded random stays in range and is repeatable", () => {
    const r1 = seededRandom(42);
    const r2 = seededRandom(42);
    for (let i = 0; i < 200; i++) {
      const v = r1();
      expect(v).toBe(r2());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
