import { describe, expect, it } from "vitest";
import { createSceneUpdateOpts, syncSceneUpdateOpts } from "../scene-update-opts";
import { DEFAULT_SETTINGS, type Settings } from "../settings";
import {
  MusicDirector,
  applyDirectorToPostFx,
  applyDirectorToScene,
  type DirectorEvent,
  type DirectorState,
} from "../music-director";

const DT = 1 / 60;

/** Runs `seconds` of a steady level; returns every event fired. */
function run(
  director: MusicDirector,
  seconds: number,
  level: number,
  extra: { centroid?: number; synced?: boolean; barEvery?: number } = {},
): DirectorEvent[] {
  const events: DirectorEvent[] = [];
  const frames = Math.round(seconds / DT);
  const barFrames = Math.round((extra.barEvery ?? 2) / DT);
  for (let i = 0; i < frames; i++) {
    const state = director.tick({
      dt: DT,
      bass: level,
      mid: level,
      high: level,
      centroid: extra.centroid ?? 0.3,
      barJustStarted: Boolean(extra.synced) && i % barFrames === 0,
      phraseJustStarted: Boolean(extra.synced) && i % (barFrames * 4) === 0,
      synced: Boolean(extra.synced),
    });
    if (state.event) events.push(state.event);
  }
  return events;
}

const state = (over: Partial<DirectorState> = {}): DirectorState => ({
  event: null,
  intensity: 0.5,
  burst: 0,
  calm: 0,
  shotOrbit: 1,
  shotDrift: 1,
  shotPitch: 0,
  shotZoom: 1,
  paletteShift: 0,
  ...over,
});

describe("MusicDirector", () => {
  it("stays silent on a steady track", () => {
    const director = new MusicDirector(() => 0.5);
    expect(run(director, 40, 0.4)).toEqual([]);
  });

  it("stays silent on a steady beat, where the level spikes on every kick", () => {
    // What real audio looks like: a sharp hit each beat, not a flat level.
    for (const synced of [false, true]) {
      const director = new MusicDirector(() => 0.5);
      const events: DirectorEvent[] = [];
      for (let i = 0; i < 60 * 40; i++) {
        const sinceKick = (i * DT * 1000) % 476;
        const level = 0.08 + 0.7 * Math.exp(-sinceKick / 90);
        const state = director.tick({
          dt: DT,
          bass: level,
          mid: level * 0.5,
          high: 0.1,
          centroid: 0.3,
          barJustStarted: synced && i % 114 === 0,
          phraseJustStarted: synced && i % 456 === 0,
          synced,
        });
        if (state.event) events.push(state.event);
      }
      expect(events, synced ? "synced" : "unsynced").toEqual([]);
    }
  });

  it("with a beat grid, calls a drop exactly when the clock anchors a section", () => {
    const director = new MusicDirector(() => 0.5);
    run(director, 12, 0.12, { synced: true });
    // A level jump alone is not a drop once the clock is judging sections.
    expect(run(director, 3, 0.7, { synced: true })).not.toContain("drop");
    const state = director.tick({
      dt: DT,
      bass: 0.7,
      mid: 0.7,
      high: 0.7,
      centroid: 0.3,
      barJustStarted: false,
      phraseJustStarted: false,
      synced: true,
      sectionStart: true,
    });
    expect(state.event).toBe("drop");
    expect(state.burst).toBe(1);
  });

  it("calls a breakdown once, not again while it lasts", () => {
    const director = new MusicDirector(() => 0.5);
    run(director, 20, 0.6);
    const events = run(director, 30, 0.12);
    expect(events.filter((e) => e === "breakdown")).toHaveLength(1);
  });

  it("does not read being switched on mid-song as a drop", () => {
    const director = new MusicDirector(() => 0.5);
    expect(run(director, 3, 0.7)).toEqual([]);
  });

  it("fires one drop when a quiet passage breaks into a loud one", () => {
    const director = new MusicDirector(() => 0.5);
    run(director, 12, 0.12);
    const events = run(director, 4, 0.6);
    expect(events.filter((e) => e === "drop")).toHaveLength(1);
    // Fired promptly, not seconds late.
    const fresh = new MusicDirector(() => 0.5);
    run(fresh, 12, 0.12);
    expect(run(fresh, 0.5, 0.6)).toContain("drop");
  });

  it("flares on the drop and lets the burst die away", () => {
    const director = new MusicDirector(() => 0.5);
    run(director, 12, 0.12);
    run(director, 0.5, 0.6);
    const at = director.tick({
      dt: DT,
      bass: 0.6,
      mid: 0.6,
      high: 0.6,
      centroid: 0.3,
      barJustStarted: false,
      phraseJustStarted: false,
      synced: false,
    });
    expect(at.burst).toBeGreaterThan(0.4);
    expect(at.paletteShift).toBe(1);
    run(director, 2, 0.6);
    expect(at.burst).toBe(0);
  });

  it("calls a breakdown when the level falls away, and calms until it returns", () => {
    const director = new MusicDirector(() => 0.5);
    run(director, 20, 0.6);
    const events = run(director, 3, 0.15);
    expect(events).toContain("breakdown");
    const mid = director.tick({
      dt: DT,
      bass: 0.15,
      mid: 0.15,
      high: 0.15,
      centroid: 0.3,
      barJustStarted: false,
      phraseJustStarted: false,
      synced: false,
    });
    expect(mid.calm).toBeGreaterThan(0.8);
    run(director, 3, 0.6);
    expect(mid.calm).toBeLessThan(0.1);
  });

  it("rate-limits repeated changes", () => {
    const director = new MusicDirector(() => 0.5);
    run(director, 12, 0.1);
    const events: DirectorEvent[] = [];
    // Alternate loud/quiet every half second for ten seconds.
    for (let i = 0; i < 20; i++) events.push(...run(director, 0.5, i % 2 ? 0.1 : 0.7));
    expect(events.filter((e) => e === "drop").length).toBeLessThanOrEqual(3);
  });

  it("changes the camera shot on each phrase and reverses it on a change", () => {
    const rolls = [0.1, 0.5, 0.9, 0.3, 0.7];
    let n = 0;
    const director = new MusicDirector(() => rolls[n++ % rolls.length]!);
    run(director, 8.2, 0.4, { synced: true });
    const before = director.tick({
      dt: DT,
      bass: 0.4,
      mid: 0.4,
      high: 0.4,
      centroid: 0.3,
      barJustStarted: false,
      phraseJustStarted: false,
      synced: true,
    });
    const orbitBefore = before.shotOrbit;
    expect(orbitBefore).not.toBe(1);
    expect(orbitBefore).toBeGreaterThan(0);
    // Settle into a quiet passage, note the direction, then drop.
    run(director, 12, 0.1, { synced: true });
    const directionBeforeDrop = Math.sign(before.shotOrbit);
    const drop = director.tick({
      dt: DT,
      bass: 0.7,
      mid: 0.7,
      high: 0.7,
      centroid: 0.3,
      barJustStarted: false,
      phraseJustStarted: false,
      synced: true,
      sectionStart: true,
    });
    expect(drop.event).toBe("drop");
    run(director, 1.2, 0.7, { synced: true });
    expect(Math.sign(before.shotOrbit)).toBe(-directionBeforeDrop);
  });

  it("keeps every output finite and in range under hostile input", () => {
    const director = new MusicDirector();
    for (let i = 0; i < 2000; i++) {
      const s = director.tick({
        dt: i % 7 === 0 ? 5 : DT,
        bass: i % 3 ? 1 : 0,
        mid: i % 5 ? 0 : 1,
        high: i % 2,
        centroid: (i % 10) / 10,
        barJustStarted: i % 11 === 0,
        phraseJustStarted: i % 44 === 0,
        synced: i % 100 < 50,
      });
      for (const v of [s.intensity, s.burst, s.calm]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Number.isFinite(s.shotOrbit) && Number.isFinite(s.shotDrift)).toBe(true);
    }
  });
});

describe("applyDirectorToScene", () => {
  const opts = (view: string, over: Partial<Settings> = {}) => {
    const o = createSceneUpdateOpts(view);
    syncSceneUpdateOpts(o, { ...DEFAULT_SETTINGS, ...over, view }, view, false, false);
    return o;
  };

  it("changes nothing at amount 0", () => {
    const o = opts("terrain");
    const before = { ...o };
    applyDirectorToScene(o, "terrain", state({ burst: 1, intensity: 1 }), 0);
    expect(o).toEqual(before);
  });

  it("moves the camera in every view, including ones with no drift of their own", () => {
    for (const view of ["combo", "terrain", "fractal", "blackhole"]) {
      const o = opts(view, { cameraDrift: false, cameraBeat: false, orbitSpeed: 0 });
      applyDirectorToScene(o, view, state({ shotOrbit: -2.1, shotDrift: 1.6, intensity: 0.9 }), 1);
      expect(o.orbitSpeed, view).toBeLessThan(-0.2);
      expect(o.cameraDrift && o.cameraDriftAmount > 0.4, view).toBe(true);
      expect(o.cameraBeat && o.cameraBeatAmount > 0.3, view).toBe(true);
    }
  });

  it("turns, re-frames and pushes in the mouse camera, which ignores the auto orbit", () => {
    const o = opts("terrain", { cameraMouse: true });
    applyDirectorToScene(
      o,
      "terrain",
      state({ shotOrbit: -1.3, shotPitch: 0.4, shotZoom: 0.8, intensity: 0.8 }),
      1,
    );
    expect(o.dynamicYawRate).toBeLessThan(-0.2);
    expect(o.dynamicPitch).toBeCloseTo(0.4, 5);
    expect(o.dynamicZoom).toBeCloseTo(0.8, 5);
    const drop = opts("terrain");
    applyDirectorToScene(drop, "terrain", state({ burst: 1 }), 1);
    expect(drop.dynamicZoom).toBeLessThan(0.85);
    // Reset every frame, so switching Dynamic Mode off leaves no residue.
    expect(opts("terrain").dynamicYawRate).toBe(0);
    expect(opts("terrain").dynamicZoom).toBe(1);
  });

  it("scales the view up on a drop and down through a breakdown, within bounds", () => {
    const base = opts("terrain").terrainAmplitude;
    const loud = opts("terrain");
    applyDirectorToScene(loud, "terrain", state({ intensity: 1, burst: 1 }), 1);
    const quiet = opts("terrain");
    applyDirectorToScene(quiet, "terrain", state({ intensity: 0.1, calm: 1 }), 1);
    expect(loud.terrainAmplitude).toBeGreaterThan(base * 1.4);
    expect(quiet.terrainAmplitude).toBeLessThan(base * 0.6);
    expect(quiet.terrainAmplitude).toBeGreaterThanOrEqual(0.05);
    expect(loud.orbitSpeed).toBeLessThanOrEqual(2.5);
    expect(loud.cameraBeatAmount).toBeLessThanOrEqual(2.5);
  });
});

describe("applyDirectorToPostFx", () => {
  const pooled = () => ({ ...DEFAULT_SETTINGS });

  it("returns the source values untouched at amount 0", () => {
    const source = { ...DEFAULT_SETTINGS, grading: false };
    const out = applyDirectorToPostFx(pooled(), source, state({ burst: 1 }), 0);
    expect(out).toEqual(source);
  });

  it("hits radial blur, chroma and glitch on a drop without changing the source", () => {
    const source = { ...DEFAULT_SETTINGS, radialBlur: false, chroma: false, glitch: false };
    const copy = { ...source };
    const out = applyDirectorToPostFx(pooled(), source, state({ burst: 0.9 }), 1);
    expect(out.radialBlur && out.radialBase > 0.15).toBe(true);
    expect(out.radialKickAmount).toBe(0);
    expect(out.chroma && out.chromaAmount > 0.008).toBe(true);
    expect(out.glitch).toBe(true);
    expect(source).toEqual(copy);
    // Gone once the burst has decayed.
    const after = applyDirectorToPostFx(pooled(), source, state({ burst: 0 }), 1);
    expect(after.radialBlur || after.chroma || after.glitch).toBe(false);
  });

  it("grades from neutral when the user's grade is off, and from theirs when it is on", () => {
    const off = {
      ...DEFAULT_SETTINGS,
      grading: false,
      exposure: 3,
      saturation: 0,
      contrast: 2,
      hue: 1,
    };
    const a = applyDirectorToPostFx(pooled(), off, state({ intensity: 0.5 }), 1);
    expect([a.exposure, a.saturation, a.contrast, a.hue]).toEqual([1, 1, 1, 0]);
    const on = {
      ...DEFAULT_SETTINGS,
      grading: true,
      exposure: 1.2,
      saturation: 0.8,
      contrast: 1.3,
    };
    const b = applyDirectorToPostFx(pooled(), on, state({ intensity: 0.5 }), 1);
    expect([b.exposure, b.saturation, b.contrast]).toEqual([1.2, 0.8, 1.3]);
    const calm = applyDirectorToPostFx(pooled(), on, state({ intensity: 0.2, calm: 1 }), 1);
    expect(calm.exposure).toBeLessThan(1.2);
    expect(calm.saturation).toBeLessThan(0.8);
    expect(calm.saturation).toBeGreaterThanOrEqual(0);
  });
});
