import { SongClock } from "../../song-clock";

export const BEAT_MS = 500;

export function tickAt(
  clock: SongClock,
  now: number,
  overrides: Partial<{
    estimatedBpm: number;
    bpmConfidence: number;
    bpmLocked: boolean;
  }> = {},
) {
  return clock.tick({
    now,
    estimatedBpm: 120,
    bpmConfidence: 0.8,
    bpmLocked: true,
    ...overrides,
  });
}

export function startAuto(clock: SongClock, epochMs = 400): void {
  for (let i = 0; i < 4; i++) {
    tickAt(clock, epochMs - 300 + i * 100, { bpmConfidence: 0.7, bpmLocked: false });
  }
  tickAt(clock, epochMs, { bpmConfidence: 0.7, bpmLocked: false });
}
