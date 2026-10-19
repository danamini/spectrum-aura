import { Mic, MonitorSpeaker, Sparkles, X } from "lucide-react";
import type { AudioCaptureSupport } from "@spectrum-aura/engine/audio-support";
import { isMidiSupported } from "@spectrum-aura/engine/midi";
import { LOCAL_DEV_URL } from "../theme";

export function AudioSourcePrompt({
  support,
  error,
  ambientActive,
  onMic,
  onSystem,
  onAmbient,
  onDismiss,
  onMidi,
}: {
  support: AudioCaptureSupport;
  error: string | null;
  ambientActive: boolean;
  onMic: () => void;
  onSystem: () => void;
  onAmbient: () => void;
  onDismiss: () => void;
  onMidi?: () => void;
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
          Input source
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
              <button
                onClick={onAmbient}
                aria-pressed={ambientActive}
                className={`group rounded-md border px-4 py-3 text-left transition-colors ${
                  ambientActive
                    ? "border-emerald-300/50 bg-emerald-400/10"
                    : "border-white/15 bg-white/5 hover:border-emerald-300/60 hover:bg-emerald-400/10"
                }`}
              >
                <span className="flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.2em] text-white/80 group-hover:text-white">
                  <span className="flex items-center gap-3">
                    <Sparkles
                      className={`h-4 w-4 ${ambientActive ? "text-emerald-300" : "text-white/60 group-hover:text-emerald-300"}`}
                    />
                    Ambient mode — no music
                  </span>
                  <span
                    className={`font-mono text-[9px] tracking-wider ${ambientActive ? "text-emerald-300" : "text-white/30"}`}
                  >
                    {ambientActive ? "ON" : ""}
                  </span>
                </span>
                <span className="mt-1.5 block font-mono text-[10px] normal-case leading-relaxed tracking-wide text-white/45 group-hover:text-white/70">
                  A synthetic groove drives the visuals — great as a screen background. Real audio
                  takes over whenever you pick a source.
                </span>
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
        {onMidi && (
          <button
            onClick={onMidi}
            disabled={!isMidiSupported()}
            className="mt-3 w-full rounded-md border border-white/15 bg-white/5 px-4 py-3 text-left font-mono text-[11px] text-white/80 hover:border-emerald-300/60 disabled:opacity-40"
          >
            <span className="block">Use MIDI controller</span>
            <span className="mt-1 block text-[10px] text-white/50">
              {isMidiSupported()
                ? "Pads, knobs and sliders control scenes and effects. Works with or without audio."
                : "Web MIDI is unavailable in this browser."}
            </span>
          </button>
        )}
        {error && (
          <p className="mt-4 rounded border border-red-500/30 bg-red-500/10 px-3 py-2 font-mono text-[11px] text-red-300">
            {error}
          </p>
        )}
        <p className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] leading-relaxed tracking-wide text-white/30">
          <a
            href="https://github.com/danamini/spectrum-aura"
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1.5 text-white/45 transition-colors hover:text-emerald-300"
          >
            <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
              <path
                fill="currentColor"
                d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.33c-2.23.48-2.7-1.07-2.7-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.22 1.87.87 2.33.67.07-.52.28-.87.5-1.07-1.78-.2-3.65-.89-3.65-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.28.82 2.15 0 3.07-1.87 3.75-3.66 3.95.29.25.54.73.54 1.48v2.2c0 .21.15.46.55.38A8 8 0 0 0 8 0Z"
              />
            </svg>
            Open source on GitHub
          </a>
          <span>Found a mistake or have an idea? Issues and pull requests are welcome.</span>
        </p>
      </div>
    </div>
  );
}
