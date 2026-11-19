import { describe, expect, it } from "vitest";
import {
  buildTrack,
  clockBeatInPhraseAt,
  measure,
  simulate,
  type Section,
} from "./helpers/sync-sim";

/**
 * End-to-end sync quality against ground truth: simulated tracks with known
 * beat times and arrangements are played through BeatMatcher → BPMDetector →
 * SongClock exactly as the app runs them each frame.
 *
 * Baseline before the periodicity estimator, phase lock and per-beat section
 * detection (same harness, 19 November 2026): tempo error 0.15–3.35%, beat
 * alignment 0.11–0.43 of a beat (chance is 0.25), 0 of 20 drops anchored.
 */
const arrangement = (pattern: Array<[Section, number]>) =>
  pattern.flatMap(([section, bars]) => Array.from({ length: bars }, () => section));
const barsFor = (bpm: number, seconds: number) => Math.ceil((seconds * bpm) / 240);

// The detector folds tempo into 80–180, so each of these has one right answer.
const TEMPOS = [88, 95.5, 100, 110, 120, 124, 128, 133.3, 140, 150, 160, 174];

describe("tempo and beat alignment", () => {
  it.each(TEMPOS)("locks %s BPM accurately on a full mix and sits on the beat", (bpm) => {
    const track = buildTrack({
      bpm,
      seed: Math.round(bpm * 3),
      bars: arrangement([["full", barsFor(bpm, 40)]]),
      offsetMs: 137 + Math.round(bpm),
    });
    const m = measure(track, simulate(track));
    expect(m.lockAtMs, "syncs at all").not.toBeNull();
    expect(m.lockAtMs!, "syncs within 4 s").toBeLessThanOrEqual(4000);
    expect(m.octave, "right octave").toBe(false);
    expect(m.tempoError, "tempo within 0.2%").toBeLessThanOrEqual(0.002);
    expect(m.phaseError, "beats within a tenth of a beat").toBeLessThanOrEqual(0.1);
  });

  it.each([100, 120, 128, 140])(
    "holds %s BPM on a kick-on-1-and-3 groove, where interval timing used to wander",
    (bpm) => {
      const track = buildTrack({
        bpm,
        seed: bpm + 5,
        bars: arrangement([["intro", barsFor(bpm, 40)]]),
        offsetMs: 263,
      });
      const m = measure(track, simulate(track));
      expect(m.octave).toBe(false);
      expect(m.tempoError).toBeLessThanOrEqual(0.003);
      expect(m.phaseError).toBeLessThanOrEqual(0.1);
    },
  );

  it.each([
    ["30 fps", 30, 1],
    ["120 fps", 120, 1],
    ["a quiet source", 60, 0.35],
  ] as const)("is as accurate at %s", (_label, fps, volume) => {
    for (const bpm of [100, 128, 150]) {
      const track = buildTrack({
        bpm,
        seed: bpm + fps,
        bars: arrangement([["full", barsFor(bpm, 40)]]),
        offsetMs: 191,
        volume,
      });
      const m = measure(track, simulate(track, fps));
      expect(m.octave, `${bpm} octave`).toBe(false);
      expect(m.tempoError, `${bpm} tempo`).toBeLessThanOrEqual(0.003);
      expect(m.phaseError, `${bpm} phase`).toBeLessThanOrEqual(0.12);
    }
  });

  it("holds its tempo through a breakdown with no beats to follow", () => {
    for (const bpm of [100, 120, 128, 140]) {
      const bars = arrangement([
        ["full", 12],
        ["breakdown", 8],
        ["full", 4],
      ]);
      const track = buildTrack({ bpm, seed: bpm + 31, bars, offsetMs: 211 });
      const frames = simulate(track);
      const breakdownEnd = 211 + 20 * 4 * track.beatMs;
      const atEnd = frames.find((f) => f.t >= breakdownEnd - 50)!;
      expect(atEnd.timing.synced, `${bpm} still synced`).toBe(true);
      expect(Math.abs(atEnd.bpm - bpm) / bpm, `${bpm} tempo held`).toBeLessThanOrEqual(0.005);
    }
  });
});

describe("drop detection", () => {
  // Eight beats into the drop the clock should read beat 9 of the phrase.
  const landsOnDrop = (
    bpm: number,
    lead: Section,
    leadBars: number,
    breakBars: number,
    seed: number,
  ) => {
    const bars = arrangement([
      [lead, leadBars],
      ["breakdown", breakBars],
      ["full", 12],
    ]);
    const track = buildTrack({ bpm, seed, bars, offsetMs: 211 });
    const dropBeat = (leadBars + breakBars) * 4;
    return clockBeatInPhraseAt(track, simulate(track), dropBeat + 8) === 9;
  };

  it("puts bar 1 on the drop after a breakdown, wherever the grid was before", () => {
    const misses: string[] = [];
    let total = 0;
    for (const bpm of [100, 120, 128, 140, 174]) {
      // Lead-ins of 9, 10 and 12 bars and breakdowns of 4, 6 and 7 put the
      // drop off the clock's existing 4-bar grid: only detection can fix it.
      for (const [leadBars, breakBars] of [
        [8, 8],
        [10, 6],
        [9, 4],
        [12, 7],
      ] as const) {
        for (const lead of ["intro", "full"] as const) {
          total += 1;
          if (!landsOnDrop(bpm, lead, leadBars, breakBars, bpm + leadBars)) {
            misses.push(`${bpm} ${lead} ${leadBars}/${breakBars}`);
          }
        }
      }
    }
    expect(total).toBe(40);
    expect(misses, `missed: ${misses.join(", ")}`).toHaveLength(0);
  });

  it("holds up across other seeds", () => {
    let hits = 0;
    let total = 0;
    for (let seed = 1; seed <= 20; seed++) {
      total += 1;
      if (
        landsOnDrop(
          [100, 120, 128, 140][seed % 4]!,
          "intro",
          9 + (seed % 3),
          4 + (seed % 4),
          seed * 17,
        )
      ) {
        hits += 1;
      }
    }
    expect(hits / total, `${hits}/${total}`).toBeGreaterThanOrEqual(0.9);
  });

  it("does not move the phrase on a steady track", () => {
    for (const [bpm, section] of [
      [100, "full"],
      [128, "full"],
      [120, "intro"],
      [140, "intro"],
    ] as const) {
      const track = buildTrack({
        bpm,
        seed: bpm + 3,
        bars: arrangement([[section, barsFor(bpm, 60)]]),
        offsetMs: 173,
      });
      // The first seconds, before the tempo has settled, are allowed to move.
      const sections = simulate(track).filter(
        (f) => f.t > 10000 && f.timing.phraseChangeDetected,
      ).length;
      expect(sections, `${bpm} ${section}`).toBe(0);
    }
  });
});
