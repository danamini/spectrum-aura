import { HUD_GLASS } from "../theme";
import { memo, useRef, useState } from "react";
import { getLiveTempoFrame } from "@spectrum-aura/engine/live-tempo";
import { statsHealth, statsReport, type HealthTone } from "./stats-health";
import { capFor } from "../keymap";
import { settingsStore } from "../store";
import { nextSparklineRange, sparklinePoints, type SparklineRange } from "./stats-history";
import {
  Check,
  ChevronDown,
  Copy,
  Maximize2,
  Minimize2,
  RotateCcw,
  MoveDiagonal2,
  X,
} from "lucide-react";
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
  const pct = (value: number) => (Number.isFinite(value) ? `${Math.round(value * 100)}%` : "n/a");
  // Read with each stats refresh; the panel does not need per-frame tempo.
  const tempo = getLiveTempoFrame();
  const bar = tempo.barTiming;
  const health = statsHealth(stats, tempo);
  const [copied, setCopied] = useState(false);
  const copyReport = () => {
    const text = statsReport(stats, tempo, settingsStore.get().view);
    void navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard access can be refused; the readings stay on screen.
      });
  };
  const creditsInUse = stats.assetOverlayEnabled || stats.textOverlayEnabled;

  return (
    <div
      role="region"
      data-ui-control
      aria-label="Stats for nerds"
      className={`@container fixed z-[120] pointer-events-auto flex flex-col overflow-hidden rounded-lg border border-white/15 shadow-[0_0_50px_rgba(0,0,0,0.25)] ${HUD_GLASS}`}
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
            {capFor("stats")} toggle • Shift+{capFor("stats")} full page
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={copyReport}
            aria-label="Copy stats as text"
            title="Copy the readings as text, for a bug report"
            className="rounded border border-white/15 p-1.5 text-white/75 hover:bg-white/10"
          >
            {copied ? (
              <Check className="h-3.5 w-3.5 text-emerald-300" />
            ) : (
              <Copy className="h-3.5 w-3.5" />
            )}
          </button>
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
        aria-label="Health"
        className="grid shrink-0 grid-cols-2 gap-1.5 border-b border-white/10 p-2 font-mono @[520px]:grid-cols-4"
      >
        {health.map((item) => (
          <div
            key={item.id}
            title={item.note}
            data-tone={item.tone}
            className={`rounded border px-2 py-1.5 ${HEALTH_TONE[item.tone]}`}
          >
            <div className="text-[8px] uppercase tracking-[0.18em] text-white/45">{item.label}</div>
            <div className="text-[12px] tabular-nums">{item.value}</div>
          </div>
        ))}
        {health.some((item) => item.tone === "warn" || item.tone === "bad") && (
          <p className="col-span-full px-0.5 text-[9px] leading-relaxed text-white/55">
            {health.find((item) => item.tone === "bad" || item.tone === "warn")!.note}
          </p>
        )}
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
          <Stat
            label="Audio → UI"
            value={`${fmt(stats.audioToRenderMs, 1)} ms`}
            color="emerald"
            hint="From the audio being read to the frame being drawn."
          />
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
          <Stat
            label="FFT window"
            value={`${fmt(stats.fftWindowMs, 1)} ms`}
            hint="How much audio each analysis looks at. Larger is smoother but later."
          />
          <Stat
            label="Base latency"
            value={`${fmt(stats.baseLatencyMs, 1)} ms`}
            hint="Delay the browser's audio system adds before the app sees the sound."
          />
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
            value={pct(stats.bass)}
            sparkline={stats.bassHistory}
            color="emerald"
          />
          <Stat label="Mid" value={pct(stats.mid)} sparkline={stats.midHistory} color="cyan" />
          <Stat label="High" value={pct(stats.high)} sparkline={stats.highHistory} color="amber" />
          <Stat
            label="Brightness"
            value={
              stats.sampleRate > 0 && stats.centroid > 0
                ? `≈ ${Math.round((stats.centroid * stats.sampleRate) / 2 / 10) * 10} Hz`
                : "n/a"
            }
            hint="Spectral centroid: where the weight of the sound sits. Higher is brighter."
          />
        </StatSection>

        <StatSection title="Tempo & sync">
          <Stat
            label="Clock"
            value={bar.bpmLocked ? `${fmt(bar.clockBpm, 1)} bpm · locked` : "not locked"}
            hint="The beat clock every view follows."
          />
          <Stat
            label="Detector"
            value={
              stats.bpm > 0
                ? `${stats.bpm} bpm · ${fmt(stats.bpmConfidence * 100, 0)}%`
                : "detecting"
            }
            hint="What tempo detection currently hears, and how sure it is."
          />
          <Stat label="Clock source" value={bar.source} hint="auto, tapped, or external MIDI." />
          <Stat
            label="Position"
            value={bar.bpmLocked ? `bar ${bar.barInPhrase} · beat ${bar.beatInBar}` : "n/a"}
            hint="Where the clock is within the current four-bar phrase."
          />
          <Stat
            label="Last section"
            value={
              tempo.sectionEvent
                ? `${tempo.sectionEvent.kind} · ${Math.max(0, Math.round((performance.now() - tempo.sectionEvent.atMs) / 1000))} s ago`
                : "none yet"
            }
            hint="The most recent drop or breakdown detected."
          />
          <Stat label="Beat" value={stats.beat ? "yes" : "no"} />
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

        {/* Credits for overlay artwork and text: shown only while those overlays are on. */}
        {stats.assetOverlayEnabled && (
          <StatSection title="Overlay FX">
            <Stat
              label="Asset overlay"
              value={stats.assetOverlayEnabled ? "enabled" : "disabled"}
            />
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
        )}
        {stats.textOverlayEnabled && (
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
        )}
        {!creditsInUse && (
          <p className="col-span-full px-1 text-[9px] text-white/35">
            Artwork and text credits appear here while an overlay effect is on.
          </p>
        )}
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

const HEALTH_TONE: Record<HealthTone, string> = {
  good: "border-emerald-400/30 bg-emerald-400/[0.07] text-emerald-200",
  warn: "border-amber-400/40 bg-amber-400/[0.08] text-amber-200",
  bad: "border-red-400/50 bg-red-500/[0.1] text-red-200",
  idle: "border-white/10 bg-white/[0.03] text-white/55",
};

const SECTIONS_KEY = "analyser-stats-sections-v1";
function readSectionOpen(title: string, fallback: boolean): boolean {
  try {
    const map = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") as Record<string, boolean>;
    return typeof map[title] === "boolean" ? map[title] : fallback;
  } catch {
    return fallback;
  }
}

/** A titled group of readings that folds away and remembers whether it was open. */
function StatSection({
  title,
  defaultOpen = true,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(() => readSectionOpen(title, defaultOpen));
  const toggle = () =>
    setOpen((value) => {
      const next = !value;
      try {
        const map = JSON.parse(localStorage.getItem(SECTIONS_KEY) ?? "{}") as Record<
          string,
          boolean
        >;
        map[title] = next;
        localStorage.setItem(SECTIONS_KEY, JSON.stringify(map));
      } catch {
        // Storage can be unavailable; the section still toggles for this session.
      }
      return next;
    });
  return (
    <section className="min-w-0 rounded border border-white/10 bg-black/10 p-2.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className={`flex w-full items-center justify-between text-[9px] uppercase tracking-[0.2em] text-emerald-300/70 hover:text-emerald-200 ${open ? "mb-2" : ""}`}
      >
        {title}
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="grid gap-1">{children}</div>}
    </section>
  );
}

function Stat({
  label,
  value,
  sparkline,
  scaleMinimum = 0.04,
  color = "emerald",
  hint,
}: {
  label: string;
  value: string;
  /** One line on what the reading means, shown on hover. */
  hint?: string;
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
    <div
      title={hint}
      className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 border-b border-white/5 pb-1 last:border-b-0 last:pb-0"
    >
      <span
        className={`text-white/45 ${hint ? "cursor-help underline decoration-white/15 decoration-dotted underline-offset-2" : ""}`}
      >
        {label}
      </span>
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
