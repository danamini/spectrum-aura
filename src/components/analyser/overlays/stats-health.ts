import type { LiveTempoState } from "@spectrum-aura/engine/live-tempo";
import type { NerdStats } from "./stats-types";

export type HealthTone = "good" | "warn" | "bad" | "idle";
export type HealthItem = {
  id: string;
  label: string;
  value: string;
  tone: HealthTone;
  note: string;
};

/** Frame rates at which motion stops looking smooth, then starts to stutter. */
const FPS_SMOOTH = 50;
const FPS_USABLE = 30;
/** Added delay above which visuals start to feel late, then clearly lag. */
const DELAY_TIGHT_MS = 45;
const DELAY_LOOSE_MS = 90;

/**
 * The few readings that answer "is anything wrong?", each with a verdict.
 * The rest of the panel is raw numbers; this is the part a person can act on.
 */
export function statsHealth(stats: NerdStats, tempo: LiveTempoState): HealthItem[] {
  const fps = Math.round(stats.fps);
  // What the browser and the app add between the sound arriving and the
  // frame showing it: the audio system's own delay, the app's processing, and
  // one frame to reach the screen. The in-app part alone is under a
  // millisecond and would always read as "perfect".
  const delay = stats.baseLatencyMs + stats.audioToRenderMs + stats.frameMs;
  const bar = tempo.barTiming;
  const bpm = bar.clockBpm > 0 ? bar.clockBpm : stats.bpm;
  return [
    {
      id: "fps",
      label: "Frame rate",
      value: fps > 0 ? `${fps} fps` : "starting",
      tone: fps <= 0 ? "idle" : fps >= FPS_SMOOTH ? "good" : fps >= FPS_USABLE ? "warn" : "bad",
      note:
        fps <= 0
          ? "No frames measured yet."
          : fps >= FPS_SMOOTH
            ? "Smooth."
            : fps >= FPS_USABLE
              ? "Usable, not smooth. Try Performance mode or fewer effects."
              : "Stuttering. Turn on Performance mode or pick a lighter view.",
    },
    {
      id: "input",
      label: "Input",
      value: stats.audioRunning ? "live" : "none",
      tone: stats.audioRunning ? "good" : "idle",
      note: stats.audioRunning
        ? "Audio is arriving."
        : "No audio source. Ambient mode drives the visuals until you choose one.",
    },
    {
      id: "delay",
      label: "Added delay",
      value: stats.audioRunning && delay > 0 ? `≈ ${delay.toFixed(0)} ms` : "n/a",
      tone:
        !stats.audioRunning || delay <= 0
          ? "idle"
          : delay <= DELAY_TIGHT_MS
            ? "good"
            : delay <= DELAY_LOOSE_MS
              ? "warn"
              : "bad",
      note:
        !stats.audioRunning || delay <= 0
          ? "Measured once audio is playing."
          : delay <= DELAY_TIGHT_MS
            ? "Tight. Browser audio delay, processing and one frame; capture hardware is extra."
            : delay <= DELAY_LOOSE_MS
              ? "A little late. Low-latency audio (Audio settings) helps."
              : "Visibly late. Turn on Low-latency audio and Performance mode.",
    },
    {
      id: "tempo",
      label: "Tempo",
      value: !stats.audioRunning
        ? "n/a"
        : bar.bpmLocked && bpm > 0
          ? `${bpm.toFixed(1)} locked`
          : bpm > 0
            ? `${bpm.toFixed(0)} searching`
            : "searching",
      tone: !stats.audioRunning ? "idle" : bar.bpmLocked ? "good" : "warn",
      note: !stats.audioRunning
        ? "Needs an audio source."
        : bar.bpmLocked
          ? "The beat clock has the tempo."
          : "Not locked yet. Tap T on the beat to help it.",
    },
  ];
}

const PAD = 22;

/** A plain-text copy of the readings, for pasting into a bug report. */
export function statsReport(stats: NerdStats, tempo: LiveTempoState, view: string): string {
  const bar = tempo.barTiming;
  const lines: Array<[string, string]> = [
    ["View", view],
    ...statsHealth(stats, tempo).map((item): [string, string] => [item.label, item.value]),
    ["Frame time", `${stats.frameMs.toFixed(2)} ms`],
    ["Audio to scene", `${stats.audioToSceneMs.toFixed(1)} ms`],
    ["Scene to render", `${stats.sceneToRenderMs.toFixed(1)} ms`],
    ["FFT window", `${stats.fftWindowMs.toFixed(1)} ms`],
    ["Base latency", `${stats.baseLatencyMs.toFixed(1)} ms`],
    ["Clock source", bar.source],
    ["Draw calls", String(stats.drawCalls)],
    ["Triangles", String(stats.triangles)],
    ["Textures", String(stats.textures)],
    ["Programs", String(stats.programs)],
    ["Buffer", `${stats.bufferWidth}x${stats.bufferHeight} @ ${stats.pixelRatio.toFixed(2)}`],
    ["Heap", stats.heapMb > 0 ? `${stats.heapMb.toFixed(0)} MB` : "n/a"],
    ["Sample rate", stats.sampleRate ? `${stats.sampleRate} Hz` : "n/a"],
    ["FFT size", stats.fftSize ? String(stats.fftSize) : "n/a"],
    ["Uptime", `${stats.uptimeSec.toFixed(0)} s`],
  ];
  return ["Spectrum Aura stats", ...lines.map(([k, v]) => `${k.padEnd(PAD)}${v}`)].join("\n");
}
