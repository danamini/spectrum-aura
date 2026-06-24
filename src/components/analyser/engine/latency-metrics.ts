/** Pure helpers for per-frame render latency measurement (tested). */

export const LATENCY_SMOOTH_ALPHA = 0.15;
export const LATENCY_DECAY = 0.85;
export const SIGNAL_LATENCY_VISIBLE_MS = 0.5;

export type FrameLatencyInput = {
  fftReadAt: number;
  tAfterScene: number;
  tAfterRender: number;
  signalSwing: boolean;
  signalChangeAt: number;
};

export type FrameLatencyInstant = {
  audioToSceneMs: number;
  sceneToRenderMs: number;
  audioToRenderMs: number;
  signalToRenderMs: number;
};

export type SmoothedLatency = {
  audioToRenderMs: number;
  signalToRenderMs: number;
};

export function measureFrameLatency(input: FrameLatencyInput): FrameLatencyInstant {
  const audioToSceneMs = input.tAfterScene - input.fftReadAt;
  const sceneToRenderMs = input.tAfterRender - input.tAfterScene;
  const audioToRenderMs = input.tAfterRender - input.fftReadAt;
  const signalToRenderMs =
    input.signalSwing && input.signalChangeAt > 0
      ? input.tAfterRender - input.signalChangeAt
      : 0;
  return { audioToSceneMs, sceneToRenderMs, audioToRenderMs, signalToRenderMs };
}

export function smoothLatency(
  prev: SmoothedLatency,
  instant: Pick<FrameLatencyInstant, "audioToRenderMs" | "signalToRenderMs">,
): SmoothedLatency {
  const keep = 1 - LATENCY_SMOOTH_ALPHA;
  return {
    audioToRenderMs: prev.audioToRenderMs * keep + instant.audioToRenderMs * LATENCY_SMOOTH_ALPHA,
    signalToRenderMs:
      instant.signalToRenderMs > 0
        ? prev.signalToRenderMs * keep + instant.signalToRenderMs * LATENCY_SMOOTH_ALPHA
        : prev.signalToRenderMs * LATENCY_DECAY,
  };
}

export function isSignalLatencyVisible(signalToRenderMs: number): boolean {
  return signalToRenderMs >= SIGNAL_LATENCY_VISIBLE_MS;
}
