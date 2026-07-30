import { isSignalLatencyVisible } from "@spectrum-aura/engine/latency-metrics";
import type { LatencyHudState } from "./stats-types";

export function LatencyHud({ latency }: { latency: LatencyHudState }) {
  const fmt = (v: number) => v.toFixed(1);
  const primary = latency.audioToRenderMs;
  const tone =
    primary <= 20 ? "text-emerald-300" : primary <= 40 ? "text-amber-300" : "text-orange-300";
  const showSignal = isSignalLatencyVisible(latency.signalToRenderMs);

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-10">
      <div
        className={`rounded-md border px-3 py-2 font-mono text-[10px] uppercase tracking-[0.14em] backdrop-blur-md ${
          latency.performanceMode
            ? "border-amber-300/35 bg-black/75 shadow-[0_0_24px_rgba(251,191,36,0.12)]"
            : "border-white/15 bg-black/60"
        }`}
      >
        <div className="mb-1 flex items-center gap-2 text-white/40">
          <span
            className={`h-1.5 w-1.5 rounded-full ${latency.performanceMode ? "bg-amber-300" : "bg-emerald-400"}`}
          />
          Latency
          {latency.performanceMode && (
            <span className="rounded border border-amber-300/30 px-1 py-px text-[8px] text-amber-200/80">
              perf
            </span>
          )}
        </div>
        <div className={`tabular-nums text-sm font-bold ${tone}`}>{fmt(primary)} ms</div>
        <div className="mt-1 text-[9px] normal-case tracking-normal text-white/45">Audio → UI</div>
        <div className="mt-1 grid gap-0.5 text-[9px] normal-case tracking-normal text-white/35">
          <span>audio→scene {fmt(latency.audioToSceneMs)} ms</span>
          <span>scene→render {fmt(latency.sceneToRenderMs)} ms</span>
          {showSignal && <span>signal→ui {fmt(latency.signalToRenderMs)} ms</span>}
        </div>
      </div>
    </div>
  );
}
