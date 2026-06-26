export function FreqLabels() {
  // Mapping mirrors scene.updateClassic: idx = t^1.6 * 0.7 * halfBins; freq = idx * sr/fft
  // simplifies to: freq ≈ t^1.6 * 0.35 * sampleRate. Using sr ~ 48000 → freq ≈ t^1.6 * 16800.
  const labels = [60, 120, 250, 500, 1000, 2000, 4000, 8000, 16000];
  const tFor = (hz: number) => Math.min(1, Math.max(0, Math.pow(hz / 16800, 1 / 1.6)));
  const fmt = (hz: number) => (hz >= 1000 ? `${hz / 1000}k` : `${hz}`);
  const spectrumWidth = `${(14 / 14.8) * 100}%`;
  const minGapPx = 34;
  const approxTrackPx = 1100;
  let lastShownPx = -Infinity;
  const visibleLabels = labels.filter((hz, index) => {
    if (index === labels.length - 1) return true;
    const px = tFor(hz) * approxTrackPx;
    if (px - lastShownPx < minGapPx) return false;
    lastShownPx = px;
    return true;
  });

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-14 z-[5] flex justify-center px-6 sm:px-10">
      <div className="relative h-6 w-full max-w-[1500px]">
        <div
          className="absolute inset-x-1/2 top-0 h-full -translate-x-1/2"
          style={{ width: spectrumWidth }}
        >
          {visibleLabels.map((hz, index) => {
            const left = `${tFor(hz) * 100}%`;
            const isFirst = index === 0;
            const isLast = index === visibleLabels.length - 1;
            return (
              <div
                key={hz}
                className={`absolute top-0 text-center font-mono text-[9px] uppercase tracking-[0.16em] text-white/45 ${isFirst ? "translate-x-0" : isLast ? "-translate-x-full" : "-translate-x-1/2"}`}
                style={{ left, minWidth: isFirst || isLast ? undefined : 0 }}
              >
                <div className="mx-auto mb-1 h-2 w-px bg-white/35" />
                {fmt(hz)}
                <span className="text-white/25">Hz</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
