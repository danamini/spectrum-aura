export const STATS_SAMPLE_MS = 100;
export const STATS_HISTORY_LENGTH = 52;

/** Smooth only the plotted history; the numeric diagnostics keep their raw readings. */
export function pushStatsHistory(history: number[], value: number) {
  if (!Number.isFinite(value)) return;
  const previous = history.at(-1);
  history.push(previous === undefined ? value : previous + (value - previous) * 0.65);
  if (history.length > STATS_HISTORY_LENGTH) history.shift();
}

export type SparklineRange = { min: number; max: number };

/** Follow the recent signal gradually instead of snapping as extrema leave the window. */
export function nextSparklineRange(
  values: number[],
  previous: SparklineRange | null,
  minimumSpan: number,
): SparklineRange {
  const finite = values.filter(Number.isFinite);
  const low = finite.length ? Math.min(...finite) : 0;
  const high = finite.length ? Math.max(...finite) : 0;
  const targetSpan = Math.max(minimumSpan, (high - low) * 1.3);
  const targetCenter = (low + high) / 2;
  const oldSpan = previous ? previous.max - previous.min : targetSpan;
  const oldCenter = previous ? (previous.min + previous.max) / 2 : targetCenter;
  const span = oldSpan + (targetSpan - oldSpan) * (targetSpan > oldSpan ? 0.3 : 0.04);
  const center = oldCenter + (targetCenter - oldCenter) * 0.08;
  return { min: center - span / 2, max: center + span / 2 };
}

export function sparklinePoints(values: number[], range: SparklineRange): string {
  const samples = values.slice(-STATS_HISTORY_LENGTH);
  return samples
    .map((value, index) => {
      const x = ((STATS_HISTORY_LENGTH - samples.length + index) / (STATS_HISTORY_LENGTH - 1)) * 73;
      const y = 19 - Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min))) * 18;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
