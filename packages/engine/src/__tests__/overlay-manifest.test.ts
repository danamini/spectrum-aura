import { describe, expect, it } from "vitest";

import { getOverlayTextureManifest, pickDistinctOverlaySlots } from "../overlay-manifest";

describe("getOverlayTextureManifest", () => {
  it("returns enabled overlays with base-url-prefixed public URLs", () => {
    const manifest = getOverlayTextureManifest("/spectrum-aura/");

    expect(manifest.length).toBeGreaterThanOrEqual(10);
    expect(manifest[0]?.publicUrl.startsWith("/spectrum-aura/")).toBe(true);
    expect(manifest.every((entry) => entry.publicUrl.includes("assets/"))).toBe(true);
  });

  it("deduplicates repeated paths", () => {
    const manifest = getOverlayTextureManifest("/");
    const paths = manifest.map((entry) => entry.path);

    expect(new Set(paths).size).toBe(paths.length);
  });

  it("includes family metadata for overlay variation", () => {
    const manifest = getOverlayTextureManifest("/");

    expect(manifest.every((entry) => entry.family.length > 0)).toBe(true);
    expect(new Set(manifest.map((entry) => entry.family)).size).toBeGreaterThanOrEqual(8);
  });
});

describe("pickDistinctOverlaySlots", () => {
  it("prefers different families for the next trio", () => {
    const next = pickDistinctOverlaySlots(
      [0, 1, 2],
      ["grid", "grid", "radial", "scanlines", "circuit", "halftone"],
      [1, 2, 3],
    );

    const families = next.map(
      (index) => ["grid", "grid", "radial", "scanlines", "circuit", "halftone"][index],
    );
    expect(new Set(families).size).toBe(3);
  });

  it("prefers families matching the requested bias when alternatives exist", () => {
    const next = pickDistinctOverlaySlots(
      [0, 1, 2],
      ["grid", "wave", "radial", "circuit", "scanlines", "halftone"],
      [1, 1, 1],
      "technical",
    );

    const families = next.map(
      (index) => ["grid", "wave", "radial", "circuit", "scanlines", "halftone"][index],
    );
    expect(families).toContain("circuit");
    expect(families).toContain("scanlines");
  });

  it("keeps always-eligible entries (Commons) in rotation under a mismatched bias", () => {
    // Commons textures at the pool tail have families outside the "technical"
    // bias set; the eligibility flags must keep them pickable so an opted-in
    // Commons load isn't starved out by the bias filter.
    const families = ["grid", "circuit", "scanlines", "hud", "grid", "wave", "flare", "radial"];
    const eligible = [false, false, false, false, false, true, true, true];

    const seen = new Set<number>();
    let slots: [number, number, number] = [0, 1, 2];
    for (let round = 0; round < 8; round += 1) {
      slots = pickDistinctOverlaySlots(slots, families, [1, 2, 3], "technical", eligible);
      slots.forEach((index) => seen.add(index));
    }

    expect([5, 6, 7].some((commonsIndex) => seen.has(commonsIndex))).toBe(true);
  });

  it("avoids reusing the same slot when alternatives exist", () => {
    const next = pickDistinctOverlaySlots(
      [0, 1, 2],
      ["grid", "radial", "scanlines", "circuit"],
      [1, 1, 1],
    );

    expect(next[0]).not.toBe(0);
    expect(next[1]).not.toBe(1);
    expect(next[2]).not.toBe(2);
  });
});
