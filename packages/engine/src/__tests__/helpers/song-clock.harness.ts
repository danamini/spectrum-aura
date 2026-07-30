import { SongClock } from "../../song-clock";

export const BEAT_MS = 500;

export function tickAt(
  clock: SongClock,
  now: number,
  overrides: Partial<{
    estimatedBpm: number;
    bpmConfidence: number;
    bpmLocked: boolean;
    audioBeat: boolean;
    onsetStrength: number;
    bass: number;
    mid: number;
    centroid: number;
  }> = {},
) {
  return clock.tick({
    now,
    estimatedBpm: 120,
    bpmConfidence: 0.8,
    bpmLocked: true,
    audioBeat: false,
    onsetStrength: 0,
    bass: 0,
    mid: 0,
    centroid: 0,
    ...overrides,
  });
}

export function startAuto(clock: SongClock, epochMs = 400): void {
  for (let i = 0; i < 4; i++) {
    tickAt(clock, epochMs - 300 + i * 100, { bpmConfidence: 0.7, bpmLocked: false });
  }
  tickAt(clock, epochMs, { bpmConfidence: 0.7, bpmLocked: false });
}
