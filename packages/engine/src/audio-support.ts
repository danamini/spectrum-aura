export const LOCAL_DEV_URL = "http://localhost:6789";

export type AudioCaptureSupport = {
  ok: boolean;
  reason?: string;
};

function formatMediaError(error: unknown): string {
  if (!(error instanceof DOMException)) {
    return error instanceof Error ? error.message : String(error);
  }
  if (error.name === "NotAllowedError") {
    return `Audio capture was cancelled or blocked. Try again and allow access in the picker. If no picker opens in this embedded preview, open ${LOCAL_DEV_URL} in Chrome and choose your audio source there. If access is still blocked, check the browser's site permissions and macOS Privacy & Security permissions for that browser. Ambient mode works without capture permission.`;
  }
  if (error.name === "NotFoundError") {
    return "No microphone was found. Connect an input device or choose a different audio source.";
  }
  if (error.name === "NotSupportedError" || error.name === "SecurityError") {
    return `This page cannot access audio input. Open ${LOCAL_DEV_URL} in Chrome via Run and Debug, not an embedded IDE preview or LAN IP.`;
  }
  return error.message;
}

export function getAudioCaptureSupport(): AudioCaptureSupport {
  if (typeof window === "undefined") {
    return { ok: false, reason: "Audio capture is only available in the browser." };
  }

  if (!window.isSecureContext) {
    return {
      ok: false,
      reason: `Audio capture needs a secure context. Open ${LOCAL_DEV_URL} in Chrome (not a LAN IP like 192.168.x.x, file://, or an embedded IDE preview).`,
    };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return {
      ok: false,
      reason:
        "This browser does not expose microphone APIs. Launch the app in Chrome or Edge via Run and Debug — Cursor's Simple Browser preview cannot access audio.",
    };
  }

  return { ok: true };
}

export { formatMediaError };
