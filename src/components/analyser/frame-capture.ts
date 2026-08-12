/**
 * Frame-capture bus for save-slot thumbnails. WebGL canvases render with
 * `preserveDrawingBuffer: false`, so `toDataURL` outside the render task
 * returns a blank frame — captures must happen inside the rAF loop right
 * after the composer renders. Callers queue a request here; the render loop
 * calls `resolveFrameCaptures` immediately after presenting a frame.
 */

const THUMB_WIDTH = 320;

type CaptureResolver = (dataUrl: string | null) => void;

let pending: CaptureResolver[] = [];

/** Resolves with a small JPEG data URL after the next rendered frame, or
 * null if no frame is rendered within `timeoutMs` (e.g. tab hidden). */
export function requestFrameCapture(timeoutMs = 800): Promise<string | null> {
  return new Promise((resolve) => {
    const entry: CaptureResolver = (dataUrl) => {
      window.clearTimeout(timer);
      resolve(dataUrl);
    };
    const timer = window.setTimeout(() => {
      pending = pending.filter((r) => r !== entry);
      resolve(null);
    }, timeoutMs);
    pending.push(entry);
  });
}

export function hasPendingFrameCaptures(): boolean {
  return pending.length > 0;
}

/** Called by the render loop right after a frame is presented. */
export function resolveFrameCaptures(source: HTMLCanvasElement) {
  if (pending.length === 0) return;
  const resolvers = pending;
  pending = [];
  let dataUrl: string | null = null;
  try {
    const scale = THUMB_WIDTH / Math.max(1, source.width);
    const thumb = document.createElement("canvas");
    thumb.width = THUMB_WIDTH;
    thumb.height = Math.max(1, Math.round(source.height * scale));
    const ctx = thumb.getContext("2d");
    if (ctx) {
      ctx.drawImage(source, 0, 0, thumb.width, thumb.height);
      dataUrl = thumb.toDataURL("image/jpeg", 0.7);
    }
  } catch {
    dataUrl = null;
  }
  resolvers.forEach((resolve) => resolve(dataUrl));
}
