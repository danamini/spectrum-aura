import { useEffect, useRef, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { isSignalLatencyVisible } from "../engine/latency-metrics";
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
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [panelSize, setPanelSize] = useState({ width: 360, height: 520 });
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const dragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const resizeStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originWidth: number;
    originHeight: number;
  } | null>(null);

  const panelClasses = fullscreen
    ? "fixed inset-4 z-[120]"
    : "fixed right-4 top-16 z-[120] max-w-[calc(100vw-2rem)]";

  const fmt = (value: number, digits = 1) => value.toFixed(digits);

  useEffect(() => {
    if (fullscreen) {
      setDragging(false);
      setResizing(false);
    }
  }, [fullscreen]);

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fullscreen || resizing) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button")) return;
    dragStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: dragOffset.x,
      originY: dragOffset.y,
    };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };

  const onHeaderPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId || fullscreen) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    setDragOffset({ x: drag.originX + dx, y: drag.originY + dy });
  };

  const onHeaderPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStartRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragStartRef.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (fullscreen) return;
    resizeStartRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originWidth: panelSize.width,
      originHeight: panelSize.height,
    };
    setResizing(true);
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  };

  const onResizePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStartRef.current;
    if (!resize || resize.pointerId !== e.pointerId || fullscreen) return;
    const dx = e.clientX - resize.startX;
    const dy = e.clientY - resize.startY;
    const maxWidth = Math.max(320, window.innerWidth - 32);
    const maxHeight = Math.max(300, window.innerHeight - 80);
    const nextWidth = Math.max(300, Math.min(maxWidth, resize.originWidth + dx));
    const nextHeight = Math.max(280, Math.min(maxHeight, resize.originHeight + dy));
    setPanelSize({ width: nextWidth, height: nextHeight });
  };

  const onResizePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const resize = resizeStartRef.current;
    if (!resize || resize.pointerId !== e.pointerId) return;
    resizeStartRef.current = null;
    setResizing(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className={`${panelClasses} pointer-events-auto flex flex-col overflow-hidden rounded-md border border-white/15 bg-black/70 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.45)]`}
      style={
        fullscreen
          ? undefined
          : {
              width: `min(${panelSize.width}px, calc(100vw - 2rem))`,
              height: `min(${panelSize.height}px, calc(100vh - 6rem))`,
              transform: `translate3d(${dragOffset.x}px, ${dragOffset.y}px, 0)`,
            }
      }
    >
      <div
        className={`flex items-center justify-between border-b border-white/10 px-3 py-2 ${fullscreen ? "" : dragging ? "cursor-grabbing" : "cursor-grab"}`}
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
        onPointerCancel={onHeaderPointerUp}
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
          <button
            onClick={onToggleFullscreen}
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
            className="rounded border border-white/15 bg-white/5 p-1.5 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
            title="Close stats"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="analyser-scroll grid flex-1 min-h-0 auto-rows-min grid-cols-[repeat(auto-fit,minmax(260px,1fr))] content-start gap-3 overflow-y-auto p-3 font-mono text-[10px] uppercase tracking-[0.12em] text-white/75">
        <StatSection title="Timing">
          <Stat label="FPS" value={fmt(stats.fps)} sparkline={stats.fpsHistory} color="emerald" />
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
            color="cyan"
          />
          <Stat
            label="Triangles"
            value={String(stats.triangles)}
            sparkline={stats.trianglesHistory}
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

      {!fullscreen && (
        <div
          className="absolute bottom-0 right-0 h-8 w-8 cursor-se-resize"
          onPointerDown={onResizePointerDown}
          onPointerMove={onResizePointerMove}
          onPointerUp={onResizePointerUp}
          onPointerCancel={onResizePointerUp}
        />
      )}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-white/5 pb-1 last:border-b-0 last:pb-0">
      <div className="mb-0.5 text-white/45">{label}</div>
      <div className="break-words text-[9px] normal-case tracking-normal text-white/88">
        {value}
      </div>
    </div>
  );
}

function StatSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded border border-white/10 bg-white/[0.03] p-2.5">
      <p className="mb-2 text-[9px] uppercase tracking-[0.2em] text-emerald-300/70">{title}</p>
      <div className="grid gap-1">{children}</div>
    </section>
  );
}

function Stat({
  label,
  value,
  sparkline,
  color = "emerald",
}: {
  label: string;
  value: string;
  sparkline?: number[];
  color?: "emerald" | "cyan" | "amber";
}) {
  const sparkColor =
    color === "cyan"
      ? "stroke-cyan-300/90"
      : color === "amber"
        ? "stroke-amber-300/90"
        : "stroke-emerald-300/90";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-white/5 pb-1 last:border-b-0 last:pb-0">
      <span className="text-white/45">{label}</span>
      <div className="flex items-center gap-2">
        {sparkline && sparkline.length > 1 && (
          <Sparkline values={sparkline} colorClass={sparkColor} />
        )}
        <span className="text-right text-white/90 tabular-nums">{value}</span>
      </div>
    </div>
  );
}

function Sparkline({ values, colorClass }: { values: number[]; colorClass: string }) {
  const w = 74;
  const h = 20;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 0.000001);
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * (w - 1);
      const y = (1 - (v - min) / span) * (h - 1);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="rounded-sm bg-white/[0.03]">
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
}
