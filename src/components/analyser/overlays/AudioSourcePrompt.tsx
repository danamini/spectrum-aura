import { Mic, MonitorSpeaker, X } from "lucide-react";
import type { AudioCaptureSupport } from "@spectrum-aura/engine/audio-support";
import { LOCAL_DEV_URL } from "../theme";

export function AudioSourcePrompt({
  support,
  error,
  onMic,
  onSystem,
  onDismiss,
}: {
  support: AudioCaptureSupport;
  error: string | null;
  onMic: () => void;
  onSystem: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[150] flex items-center justify-center p-6">
      <div className="pointer-events-auto relative w-full max-w-md rounded-md border border-white/10 bg-black/70 p-7 backdrop-blur-xl shadow-[0_0_60px_rgba(52,211,153,0.08)]">
        <button
          onClick={onDismiss}
          aria-label="Close audio source prompt"
          className="absolute right-3 top-3 rounded p-1 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
        <div className="mb-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-emerald-300/80">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          Audio source
        </div>
        <h1 className="mb-2 font-mono text-2xl uppercase tracking-[0.15em] text-white">
          Spectrum<span className="text-emerald-400">.</span>Aura
        </h1>
        {support.ok ? (
          <>
            <p className="mb-5 max-w-sm font-mono text-[11px] leading-relaxed tracking-wide text-white/50">
              Pick an input for the visuals to react to.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={onSystem}
                className="group rounded-md border border-emerald-300/50 bg-emerald-400/10 px-4 py-3 text-left transition-colors hover:bg-emerald-400 hover:text-black"
              >
                <span className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-emerald-100 group-hover:text-inherit">
                  <span className="flex items-center gap-3">
                    <MonitorSpeaker className="h-4 w-4" />
                    Share system audio
                  </span>
                  <span className="rounded bg-emerald-400/20 px-1.5 py-0.5 text-[9px] tracking-wider group-hover:bg-black/15">
                    Best results
                  </span>
                </span>
                <span className="mt-1.5 block font-mono text-[10px] normal-case leading-relaxed tracking-wide text-emerald-100/70 group-hover:text-inherit">
                  In the picker choose <b>Entire Screen</b> and tick{" "}
                  <b>"Also share system audio"</b> — cleanest signal, every app's sound, best beat
                  tracking. (Sharing a tab with "Share tab audio" works too.)
                </span>
              </button>
              <button
                onClick={onMic}
                className="group flex items-center justify-between gap-3 rounded-md border border-white/15 bg-white/5 px-4 py-3 text-left font-mono text-[11px] uppercase tracking-[0.2em] text-white/80 transition-colors hover:border-emerald-300/60 hover:bg-emerald-400/10 hover:text-white"
              >
                <span className="flex items-center gap-3">
                  <Mic className="h-4 w-4 text-white/60 group-hover:text-emerald-300" />
                  Use microphone
                </span>
                <span className="text-white/30 group-hover:text-emerald-300">→</span>
              </button>
            </div>
          </>
        ) : (
          <div className="space-y-4">
            <p className="max-w-sm font-mono text-[11px] leading-relaxed tracking-wide text-amber-200/90">
              {support.reason}
            </p>
            <p className="max-w-sm font-mono text-[10px] leading-relaxed tracking-wide text-white/45">
              In Cursor: open Run and Debug, choose{" "}
              <span className="text-emerald-300">Launch Chrome (Spectrum Aura)</span>, then pick mic
              or tab audio in the Chrome window at{" "}
              <span className="text-emerald-300">{LOCAL_DEV_URL}</span>.
            </p>
          </div>
        )}
        {error && (
          <p className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
