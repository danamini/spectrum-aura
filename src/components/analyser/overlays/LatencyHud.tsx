import { MINI_HUD_SURFACE } from "../theme";
import { isSignalLatencyVisible } from "@spectrum-aura/engine/latency-metrics";
import { useDraggablePanel } from "../hooks/useDraggablePanel";
import type { LatencyHudState } from "./stats-types";

export function LatencyHud({
  latency,
  active = true,
}: {
  latency: LatencyHudState;
  /** False when neither real audio nor ambient mode is producing a signal —
   * the HUD then explains itself instead of showing stale zeros. */
  active?: boolean;
}) {
  const drag = useDraggablePanel("latency-hud");
  const fmt = (v: number) => v.toFixed(1);
  const primary = latency.audioToRenderMs;
  const tone =
    primary <= 20 ? "text-emerald-300" : primary <= 40 ? "text-amber-300" : "text-orange-300";
  const showSignal = isSignalLatencyVisible(latency.signalToRenderMs);

  if (!active) {
    return (
      <div
        className="pointer-events-auto absolute right-3 z-10"
        {...drag.handleProps}
        style={{ bottom: "calc(0.75rem + var(--bottom-hud-clearance, 0px))", ...drag.style }}
      >
        <div className={`${MINI_HUD_SURFACE} font-mono text-[10px] uppercase tracking-[0.14em]`}>
          <div className="mb-1 flex items-center gap-2 text-white/40">
            <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
            Latency
          </div>
          <p className="text-[9px] normal-case leading-relaxed tracking-normal text-white/45">
            Waiting for a signal — pick an audio source (or ambient mode) to measure audio → UI
            latency.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-auto absolute right-3 z-10"
      {...drag.handleProps}
      style={{ bottom: "calc(0.75rem + var(--bottom-hud-clearance, 0px))", ...drag.style }}
    >
      <div
        className={`${MINI_HUD_SURFACE} font-mono text-[10px] uppercase tracking-[0.14em] ${
          latency.performanceMode
            ? "border-amber-300/35 shadow-[0_0_24px_rgba(251,191,36,0.12)]"
            : ""
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
        <div className={`tabular-nums text-xl font-bold ${tone}`}>{fmt(primary)} ms</div>
        <div className="mt-1 text-[9px] normal-case tracking-normal text-white/45">Audio → UI</div>
        <div className="mt-1 grid gap-0.5 text-[9px] normal-case tracking-normal text-white/50">
          <span className="flex justify-between gap-2">
            <span>Audio → scene</span>
            <span className="tabular-nums">{fmt(latency.audioToSceneMs)} ms</span>
          </span>
          <span className="flex justify-between gap-2">
            <span>Scene → render</span>
            <span className="tabular-nums">{fmt(latency.sceneToRenderMs)} ms</span>
          </span>
          <span className="flex justify-between gap-2">
            <span>Signal → UI</span>
            <span className="tabular-nums">
              {showSignal ? `${fmt(latency.signalToRenderMs)} ms` : "idle"}
            </span>
          </span>
          <span
            className="mt-1 flex justify-between gap-2 border-t border-white/10 pt-1"
            title="Audio analysed per FFT window; separate from the audio → UI processing time above."
          >
            <span>FFT window</span>
            <span className="tabular-nums">
              {latency.synthetic ? "synthetic" : `${fmt(latency.fftWindowMs)} ms`}
            </span>
          </span>
          <span
            className="flex justify-between gap-2"
            title="CPU time spent reading and analysing audio."
          >
            <span>Audio read</span>
            <span className="tabular-nums">
              {latency.synthetic ? "—" : `${latency.audioReadCpuMs.toFixed(2)} ms`}
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}
