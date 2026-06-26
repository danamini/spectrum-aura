import { BarTimingHud, ExperimentalBadge } from "./BarTimingHud";
import type { LiveTempoState } from "./engine/live-tempo";
import { bpmGlowStyle } from "./theme";

/**
 * Big BPM number with the confidence-driven emerald glow. Shared by every
 * place that shows tempo so the text-shadow / opacity / fallback rules live in
 * one spot.
 */
function BpmDigits({ tempo }: { tempo: LiveTempoState }) {
  return (
    <div
      className="font-mono text-3xl font-bold tabular-nums text-white/70"
      style={bpmGlowStyle(tempo.bpm, tempo.bpmConfidence)}
    >
      {tempo.audioRunning && tempo.bpm > 0 ? tempo.bpm : "—"}
    </div>
  );
}

/**
 * Tempo / bar-grid readout shared by the canvas overlay (`overlay`) and the
 * Audio settings flyout (`panel`). Both render the same BPM digits and bar
 * grid; only the surrounding layout differs.
 */
export function TempoReadout({
  variant,
  tempo,
}: {
  variant: "overlay" | "panel";
  tempo: LiveTempoState;
}) {
  if (variant === "overlay") {
    return (
      <>
        <BarTimingHud />
        <div className="text-center">
          <div className="mb-1 flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-widest text-white/40">
            BPM
            <ExperimentalBadge />
          </div>
          <BpmDigits tempo={tempo} />
        </div>
      </>
    );
  }

  const showGrid =
    tempo.audioRunning && (tempo.barTiming.totalBeats > 0 || tempo.bpmConfidence > 0.25);

  return (
    <div className="space-y-3 rounded-md border border-white/10 bg-white/[0.03] p-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-white/40">
            BPM
            <ExperimentalBadge />
          </div>
          {tempo.bpmConfidence > 0.25 && (
            <p className="mt-1 font-mono text-[9px] text-white/35">
              {Math.round(tempo.bpmConfidence * 100)}% confidence
              {tempo.barTiming.bpmLocked ? " · locked" : ""}
            </p>
          )}
        </div>
        <BpmDigits tempo={tempo} />
      </div>
      {showGrid ? (
        <BarTimingHud compact />
      ) : (
        <p className="font-mono text-[9px] leading-relaxed text-white/35">
          Start audio to detect tempo. Tap <span className="text-white/50">T</span> on beats,{" "}
          <span className="text-white/50">⇧T</span> on downbeat.
        </p>
      )}
    </div>
  );
}
