import { HUD_GLASS } from "../theme";
import { memo, useRef } from "react";
import { nextSparklineRange, sparklinePoints, type SparklineRange } from "./stats-history";
import { Maximize2, Minimize2, RotateCcw, MoveDiagonal2, X } from "lucide-react";
import { isSignalLatencyVisible } from "@spectrum-aura/engine/latency-metrics";
import { useStatsPanelLayout } from "../hooks/useStatsPanelLayout";
import type { NerdStats } from "./stats-types";

export function StatsForNerdsPanel({
  stats,
  fullscreen,
  onClose,
  onToggleFullscreen,
}: {
  stats: NerdStats;
  fullscreen: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
}) {
  const layout = useStatsPanelLayout(fullscreen);
  const fmt = (value: number, digits = 1) =>
    Number.isFinite(value) ? value.toFixed(digits) : "n/a";

  return (
    <div
      role="region"
      data-ui-control
      aria-label="Stats for nerds"
      className={`fixed z-[120] pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.25)] ${HUD_GLASS}`}
      style={
        fullscreen
          ? { inset: 12 }
          : {
              left: layout.rect.x,
              top: layout.rect.y,
              width: layout.rect.width,
              height: layout.rect.height,
            }
      }
    >
      <div
        data-stats-drag-handle
        className={`flex shrink-0 touch-none select-none items-center justify-between gap-2 border-b border-white/10 px-3 py-2 ${fullscreen ? "" : layout.interaction === "move" ? "cursor-grabbing" : "cursor-grab"}`}
        {...layout.handle("move")}
        onDoubleClick={(event) => {
          if (!(event.target as Element).closest("button") && !fullscreen) layout.reset();
        }}
      >
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-emerald-300/80">
            Stats for nerds
          </p>
          <p className="font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
            N toggle • Shift+N full page
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {!fullscreen && (
            <button
              onClick={layout.reset}
              aria-label="Reset stats layout"
              title="Reset position and size"
              className="rounded border border-white/15 p-1.5 text-white/75 hover:bg-white/10"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? "Restore stats panel" : "Expand stats panel"}
            className="rounded border border-white/15 bg-white/5 p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            title={fullscreen ? "Dock panel" : "Full page"}
          >
            {fullscreen ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={onClose}
            aria-label="Close stats"
            className="rounded border border-white/15 bg-white/5 p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            title="Close stats"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div
        data-stats-content
        tabIndex={0}
        aria-label="Diagnostics"
        className="analyser-scroll grid flex-1 min-h-0 auto-rows-min grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] content-start gap-3 overflow-y-auto p-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/75"
      >
        <StatSection title="Timing">
          <Stat
            label="FPS"
            value={fmt(stats.fps)}
            sparkline={stats.fpsHistory}
            scaleMinimum={3}
            color="emerald"
          />
          <Stat label="Frame ms" value={fmt(stats.frameMs, 2)} />
          <Stat label="Audio → UI" value={`${fmt(stats.audioToRenderMs, 1)} ms`} color="emerald" />
          <Stat
            label="Signal → UI"
            value={
              isSignalLatencyVisible(stats.signalToRenderMs)
                ? `${fmt(stats.signalToRenderMs, 1)} ms`
                : "idle"
            }
            color="cyan"
          />
          <Stat label="Audio → scene" value={`${fmt(stats.audioToSceneMs, 1)} ms`} />
          <Stat label="Scene → render" value={`${fmt(stats.sceneToRenderMs, 1)} ms`} />
          <Stat label="Audio read CPU" value={`${fmt(stats.audioReadCpuMs, 2)} ms`} />
          <Stat label="FFT window" value={`${fmt(stats.fftWindowMs, 1)} ms`} />
          <Stat label="Base latency" value={`${fmt(stats.baseLatencyMs, 1)} ms`} />
          <Stat label="Updates" value={String(stats.updates)} />
          <Stat label="Uptime" value={`${fmt(stats.uptimeSec, 1)}s`} />
        </StatSection>

        <StatSection title="Renderer">
          <Stat
            label="Draw calls"
            value={String(stats.drawCalls)}
            sparkline={stats.drawCallsHistory}
            scaleMinimum={10}
            color="cyan"
          />
          <Stat
            label="Triangles"
            value={String(stats.triangles)}
            sparkline={stats.trianglesHistory}
            scaleMinimum={100}
            color="amber"
          />
          <Stat label="Lines" value={String(stats.lines)} />
          <Stat label="Points" value={String(stats.points)} />
          <Stat label="Objects" value={String(stats.objects)} />
          <Stat label="Geometries" value={String(stats.geometries)} />
          <Stat label="Textures" value={String(stats.textures)} />
          <Stat label="Programs" value={String(stats.programs)} />
        </StatSection>

        <StatSection title="Viewport">
          <Stat label="Pixel ratio" value={fmt(stats.pixelRatio, 2)} />
          <Stat label="Buffer" value={`${stats.bufferWidth}x${stats.bufferHeight}`} />
          <Stat label="Canvas" value={`${stats.canvasWidth}x${stats.canvasHeight}`} />
          <Stat label="Heap MB" value={stats.heapMb > 0 ? fmt(stats.heapMb, 1) : "n/a"} />
        </StatSection>

        <StatSection title="Audio">
          <Stat label="Engine" value={stats.audioRunning ? "running" : "idle"} />
          <Stat label="Sample rate" value={stats.sampleRate ? `${stats.sampleRate} Hz` : "n/a"} />
          <Stat label="FFT size" value={stats.fftSize ? String(stats.fftSize) : "n/a"} />
          <Stat label="Smoothing" value={fmt(stats.smoothing, 3)} />
          <Stat label="Gain" value={fmt(stats.gain, 2)} />
          <Stat
            label="Bass"
            value={fmt(stats.bass, 3)}
            sparkline={stats.bassHistory}
            color="emerald"
          />
          <Stat label="Mid" value={fmt(stats.mid, 3)} sparkline={stats.midHistory} color="cyan" />
          <Stat
            label="High"
            value={fmt(stats.high, 3)}
            sparkline={stats.highHistory}
            color="amber"
          />
          <Stat label="Centroid" value={fmt(stats.centroid, 3)} />
          <Stat label="Beat" value={stats.beat ? "yes" : "no"} />
          <Stat label="BPM" value={stats.bpm > 0 ? `${stats.bpm} bpm` : "detecting"} />
          <Stat label="BPM confidence" value={fmt(stats.bpmConfidence * 100, 0) + "%"} />
        </StatSection>

        <StatSection title="Overlay FX">
          <Stat label="Asset overlay" value={stats.assetOverlayEnabled ? "enabled" : "disabled"} />
          <Stat label="Bias" value={stats.assetOverlayBias} />
          <Stat
            label="Commons"
            value={stats.assetOverlayCommonsEnabled ? stats.assetOverlayCommonsTopic : "off"}
          />
          <Stat label="Current trio" value={stats.assetOverlayCurrentFamilies.join(" / ")} />
          <Stat label="Next trio" value={stats.assetOverlayNextFamilies.join(" / ")} />
          <Stat label="Transition" value={fmt(stats.assetOverlayTransition, 2)} />
          {stats.assetOverlayCurrentEntries.map((entry, index) => (
            <MetaRow
              key={`${entry.label}-${index}`}
              label={`Asset ${index + 1}`}
              value={entry.creditLine}
            />
          ))}
        </StatSection>

        {stats.wikichromaActive && (
          <StatSection title="Wiki-Chroma">
            <Stat label="Motion mode" value={stats.wikichromaMode} />
            <Stat
              label="Packs selected"
              value={stats.wikichromaSelectedPacks.join(" / ") || "n/a"}
            />
            <Stat
              label="Models active"
              value={stats.wikichromaActiveModels.join(" / ") || "loading"}
            />
            <Stat label="Actors" value={String(stats.wikichromaActorsActive)} />
            <Stat label="Beat lock" value={stats.wikichromaBeatLocked ? "locked" : "free"} />
            <Stat label="Beats / loop" value={String(stats.wikichromaBeatsPerLoop)} />
            <Stat label="Loops" value={String(stats.wikichromaLoopCount)} />
          </StatSection>
        )}

        <StatSection title="Text Overlay">
          <Stat label="Enabled" value={stats.textOverlayEnabled ? "enabled" : "disabled"} />
          <Stat label="Source" value={stats.textOverlaySourceLabel || "n/a"} />
          <MetaRow label="Snippet" value={stats.textOverlayCurrentText || "n/a"} />
          <MetaRow
            label="Attribution"
            value={
              stats.textOverlayCreditLine ||
              [stats.textOverlayAuthor, stats.textOverlayWork, stats.textOverlayRights]
                .filter(Boolean)
                .join(" — ") ||
              "n/a"
            }
          />
          <MetaRow label="Source URL" value={stats.textOverlaySourceUrl || "n/a"} />
        </StatSection>
      </div>

      <div className="flex shrink-0 items-center justify-between border-t border-white/10 px-3 py-1 font-mono text-[9px] text-white/45">
        <span>
          {fullscreen
            ? "Full page · scroll for all diagnostics"
            : "Drag header · resize edges · scroll for more"}
        </span>
        {!fullscreen && (
          <button
            aria-label="Resize stats panel"
            data-own-arrow-keys
            title="Drag to resize, or use arrow keys (Shift for larger steps)"
            className="touch-none cursor-se-resize rounded p-1 text-emerald-300/80 focus-visible:outline focus-visible:outline-emerald-300"
            {...layout.handle("se")}
            onKeyDown={layout.onResizeKeyDown}
          >
            <MoveDiagonal2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {!fullscreen &&
        (
          [
            ["n", "top-0 left-3 right-3 h-1 cursor-n-resize"],
            ["s", "bottom-0 left-3 right-8 h-1 cursor-s-resize"],
            ["e", "right-0 top-3 bottom-8 w-1 cursor-e-resize"],
            ["w", "left-0 top-3 bottom-3 w-1 cursor-w-resize"],
            ["nw", "top-0 left-0 h-3 w-3 cursor-nw-resize"],
            ["ne", "top-0 right-0 h-3 w-3 cursor-ne-resize"],
            ["sw", "bottom-0 left-0 h-3 w-3 cursor-sw-resize"],
          ] as const
        ).map(([edge, classes]) => (
          <div
            key={edge}
            aria-hidden
            data-resize-edge={edge}
            className={`absolute touch-none ${classes}`}
            {...layout.handle(edge)}
          />
        ))}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/5 pb-1 last:border-b-0 last:pb-0">
      <div className="mb-0.5 text-white/45">{label}</div>
      <div className="[overflow-wrap:anywhere] text-[9px] normal-case tracking-normal text-white/88">
        {value}
      </div>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded border border-white/10 bg-black/10 p-2.5">
      <p className="mb-2 text-[9px] uppercase tracking-[0.2em] text-emerald-300/70">{title}</p>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  sparkline,
  scaleMinimum = 0.04,
  color = "emerald",
}: {
  label: string;
  value: string;
  sparkline?: number[];
  scaleMinimum?: number;
  color?: "emerald" | "cyan" | "amber";
}) {
  const sparkColor =
    color === "cyan"
      ? "stroke-cyan-300/90"
      : color === "amber"
        ? "stroke-amber-300/90"
        : "stroke-emerald-300/90";

  return (
    <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-white/5 pb-1 last:border-b-0 last:pb-0">
      <span className="text-white/45">{label}</span>
      <div className="flex min-w-0 max-w-full flex-wrap justify-end items-center gap-2">
        {sparkline && sparkline.length > 1 && (
          <Sparkline values={sparkline} colorClass={sparkColor} scaleMinimum={scaleMinimum} />
        )}
        <span className="min-w-0 text-right [overflow-wrap:anywhere] text-white/90 tabular-nums">
          {value}
        </span>
      </div>
    </div>
  );
}

const Sparkline = memo(function Sparkline({
  values,
  colorClass,
  scaleMinimum,
}: {
  values: number[];
  colorClass: string;
  scaleMinimum: number;
}) {
  const rangeRef = useRef<SparklineRange | null>(null);
  rangeRef.current = nextSparklineRange(values, rangeRef.current, scaleMinimum);
  const points = sparklinePoints(values, rangeRef.current);
  const w = 74;
  const h = 20;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="shrink-0 rounded-sm bg-white/[0.03]"
    >
      <title>Smoothed trend · gradually adapting scale · approximately 5 seconds</title>
      <polyline
        points={points}
        fill="none"
        strokeWidth="1.3"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={colorClass}
      />
    </svg>
  );
});
