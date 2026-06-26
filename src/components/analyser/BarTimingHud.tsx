import { BEATS_PER_PHRASE, type BarTiming } from "./engine/bar-clock";
import { useLiveTempoFrame } from "./engine/live-tempo";

export function ExperimentalBadge() {
  return (
    <span className="rounded border border-white/15 bg-white/10 px-1.5 py-0.5 text-[6px] font-bold tracking-wider text-white/50">
      EXPERIMENTAL
    </span>
  );
}

function BeatDots({ timing }: { timing: BarTiming }) {
  const activeIdx = timing.beatInPhrase - 1;
  const pulse = 0.55 + timing.beatPhase * 0.45;

  return (
    <div className="mt-2 flex justify-center gap-1.5">
      {Array.from({ length: 4 }, (_, barIdx) => (
        <div key={barIdx} className="flex gap-0.5 rounded-sm bg-white/[0.03] px-0.5 py-0.5">
          {Array.from({ length: 4 }, (_, beatIdx) => {
            const beatNumber = barIdx * 4 + beatIdx + 1;
            const beatIdx0 = beatNumber - 1;
            const isCurrent = beatIdx0 === activeIdx;
            const isPast = beatIdx0 < activeIdx;
            return (
              <div
                key={beatNumber}
                className={`h-2 w-2 rounded-full ${
                  isCurrent ? "bg-emerald-300" : isPast ? "bg-white/30" : "bg-white/10"
                }`}
                style={
                  isCurrent
                    ? {
                        opacity: pulse,
                        boxShadow: `0 0 ${6 + pulse * 6}px rgba(52,211,153,${0.45 + pulse * 0.4})`,
                        transform: `scale(${0.92 + pulse * 0.12})`,
                      }
                    : undefined
                }
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function BarTimingHud({ compact = false }: { compact?: boolean }) {
  const {
    barTiming: timing,
    bpmConfidence: confidence,
    beatHintFlash: hintFlash,
  } = useLiveTempoFrame();
  const glow = timing.synced ? Math.max(6, confidence * 16) : 4;

  return (
    <div
      className={`rounded-lg border backdrop-blur-sm ${
        hintFlash ? "border-emerald-300/50 bg-emerald-400/10" : "border-white/10 bg-black/20"
      } ${compact ? "px-2.5 py-2" : "mb-3 px-3 py-2 bg-black/35"}`}
      style={{
        boxShadow: timing.synced
          ? `0 0 ${glow}px rgba(52, 211, 153, ${confidence * 0.25})`
          : undefined,
      }}
    >
      <div className="flex items-center justify-center gap-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
        <span>4/4</span>
        {timing.source === "manual" && (
          <span className="rounded border border-emerald-300/25 bg-emerald-400/15 px-1 py-0.5 text-[7px] tracking-[0.12em] text-emerald-200/90">
            Tap
          </span>
        )}
        {timing.source === "auto" && (
          <span className="rounded border border-white/15 bg-white/10 px-1 py-0.5 text-[7px] tracking-[0.12em] text-white/60">
            Auto
          </span>
        )}
        {timing.bpmLocked && timing.source !== "manual" && (
          <span className="rounded border border-emerald-300/25 bg-emerald-400/15 px-1 py-0.5 text-[7px] tracking-[0.12em] text-emerald-200/90">
            Locked
          </span>
        )}
        {hintFlash && (
          <span className="rounded bg-emerald-400/25 px-1 py-0.5 text-[7px] tracking-[0.12em] text-emerald-100">
            {hintFlash}
          </span>
        )}
      </div>
      <div
        className={`mt-0.5 text-center font-mono font-bold tabular-nums text-emerald-100/90 ${compact ? "text-xl" : "text-2xl"}`}
      >
        {timing.beatInPhrase}
        <span className={`text-white/30 ${compact ? "text-sm" : "text-base"}`}>
          /{BEATS_PER_PHRASE}
        </span>
      </div>
      <div className="mt-0.5 text-center font-mono text-[9px] uppercase tracking-[0.14em] text-white/40">
        Bar {timing.barInPhrase} · Beat {timing.beatInBar}
      </div>
      <BeatDots timing={timing} />
      <div
        className={`mx-auto mt-2 h-1 overflow-hidden rounded-full bg-white/10 ${compact ? "w-full max-w-none" : "w-36"}`}
      >
        <div
          className="h-full rounded-full bg-emerald-400/75"
          style={{ width: `${Math.max(0, Math.min(100, timing.phrasePhase * 100))}%` }}
        />
      </div>
      {!timing.synced && !timing.bpmLocked && (
        <div className="mt-1.5 text-center font-mono text-[8px] uppercase tracking-[0.16em] text-amber-200/65">
          Syncing grid… · tap T on beats
        </div>
      )}
    </div>
  );
}
