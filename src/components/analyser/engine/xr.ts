import * as THREE from "three";

import { Scene } from "./scene";

export const WEBXR_REQUEST_EVENT = "spectrum-aura:webxr-request";
export const WEBXR_STATE_EVENT = "spectrum-aura:webxr-state";
export const WEBXR_BACKGROUND_EVENT = "spectrum-aura:webxr-background";

export type WebXrState = {
  available: boolean;
  active: boolean;
  pending: boolean;
  error: string | null;
  backgroundHidden: boolean;
};

export type WebXrStateListener = (state: WebXrState) => void;

export function requestWebXrToggle() {
  window.dispatchEvent(new Event(WEBXR_REQUEST_EVENT));
}

export function setWebXrBackgroundHidden(hidden: boolean) {
  window.dispatchEvent(new CustomEvent(WEBXR_BACKGROUND_EVENT, { detail: hidden }));
}

export async function probeWebXrSupport() {
  if (typeof navigator === "undefined" || !navigator.xr?.isSessionSupported) return false;
  try {
    return await navigator.xr.isSessionSupported("immersive-vr");
  } catch {
    return false;
  }
}

export class WebXrRuntime {
  available = false;
  active = false;
  pending = false;
  error: string | null = null;

  private session: XRSession | null = null;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly scene: Scene,
    private readonly onStateChange?: WebXrStateListener,
  ) {}

  async probeAvailability() {
    this.available = await probeWebXrSupport();
    this.emitState();
    return this.available;
  }

  async toggle() {
    if (this.active || this.pending) {
      await this.stop();
      return;
    }
    await this.start();
  }

  async start() {
    if (this.pending || this.active) return;
    if (!(await this.probeAvailability())) return;
    if (!navigator.xr?.requestSession) return;

    this.pending = true;
    this.error = null;
    this.emitState();

    try {
      const session = await navigator.xr.requestSession("immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["bounded-floor"],
      });
      this.session = session;
      session.addEventListener("end", this.handleSessionEnd);
      this.renderer.xr.enabled = true;
      this.renderer.xr.setReferenceSpaceType("local-floor");
      await this.renderer.xr.setSession(session);
      this.scene.attachWebXrControllers(this.renderer);
      this.active = true;
    } catch (error) {
      this.error = error instanceof Error ? error.message : "Failed to start WebXR";
      this.session = null;
      this.scene.detachWebXrControllers();
      this.renderer.xr.enabled = false;
    } finally {
      this.pending = false;
      this.emitState();
    }
  }

  async stop() {
    const session = this.session;
    if (!session) return;
    this.pending = true;
    this.emitState();
    try {
      await session.end();
    } finally {
      this.pending = false;
      this.emitState();
    }
  }

  dispose() {
    this.scene.detachWebXrControllers();
    this.renderer.xr.enabled = false;
    const session = this.session;
    this.session = null;
    if (session) {
      void session.end();
    }
  }

  private handleSessionEnd = () => {
    const session = this.session;
    if (session) session.removeEventListener("end", this.handleSessionEnd);
    this.session = null;
    this.active = false;
    this.pending = false;
    this.error = null;
    this.renderer.xr.enabled = false;
    this.scene.detachWebXrControllers();
    this.emitState();
  };

  private emitState() {
    this.onStateChange?.({
      available: this.available,
      active: this.active,
      pending: this.pending,
      error: this.error,
      backgroundHidden: false,
    });
  }
}
