import * as THREE from "three";

import { Scene } from "./scene";

export const WEBXR_REQUEST_EVENT = "spectrum-aura:webxr-request";
export const WEBXR_STATE_EVENT = "spectrum-aura:webxr-state";
export const WEBXR_BACKGROUND_EVENT = "spectrum-aura:webxr-background";
const TOGGLE_STATS_PANEL_EVENT = "spectrum-aura:toggle-stats-panel";
const TOGGLE_SETTINGS_PANEL_EVENT = "spectrum-aura:toggle-settings-panel";

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
  private exitHoldSeconds = 0;
  private readonly exitHoldThresholdSeconds = 0.9;

  private session: XRSession | null = null;
  private pressedButtons = new Set<string>();

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
      const sessionInit: XRSessionInit & { domOverlay?: { root: Element } } = {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["bounded-floor", "hand-tracking"],
      };
      if (typeof document !== "undefined") {
        sessionInit.optionalFeatures = [...(sessionInit.optionalFeatures ?? []), "dom-overlay"];
        sessionInit.domOverlay = { root: document.body };
      }

      const session = await navigator.xr.requestSession("immersive-vr", sessionInit);
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
      this.exitHoldSeconds = 0;
      this.pending = false;
      this.emitState();
    }
  }

  tick(dt: number) {
    const session = this.session;
    if (!session || !this.active) {
      this.exitHoldSeconds = 0;
      this.pressedButtons.clear();
      return;
    }

    let squeezeCount = 0;
    for (const source of session.inputSources) {
      const buttons = source.gamepad?.buttons;
      if (!buttons || buttons.length < 2) continue;
      const hand = source.handedness || "unknown";
      const squeeze = buttons[1];
      if (!squeeze) continue;
      if (squeeze.pressed || squeeze.value > 0.82) squeezeCount += 1;

      // Quest primary face buttons (typically index 4 = A/X, index 5 = B/Y)
      const primary = buttons[4];
      const secondary = buttons[5];

      this.handleEdgeButton(
        `${hand}:4`,
        Boolean(primary && (primary.pressed || primary.value > 0.82)),
        () => {
          if (hand === "right") {
            window.dispatchEvent(new Event(TOGGLE_SETTINGS_PANEL_EVENT));
          } else {
            window.dispatchEvent(new CustomEvent(WEBXR_BACKGROUND_EVENT, { detail: true }));
          }
        },
      );

      this.handleEdgeButton(
        `${hand}:5`,
        Boolean(secondary && (secondary.pressed || secondary.value > 0.82)),
        () => {
          if (hand === "right") {
            window.dispatchEvent(new Event(TOGGLE_STATS_PANEL_EVENT));
          } else {
            window.dispatchEvent(new CustomEvent(WEBXR_BACKGROUND_EVENT, { detail: false }));
          }
        },
      );
    }

    if (squeezeCount >= 2) {
      this.exitHoldSeconds += dt;
      if (this.exitHoldSeconds >= this.exitHoldThresholdSeconds && !this.pending) {
        this.exitHoldSeconds = 0;
        void this.stop();
      }
      return;
    }

    this.exitHoldSeconds = 0;
  }

  private handleEdgeButton(key: string, pressed: boolean, onPress: () => void) {
    const wasPressed = this.pressedButtons.has(key);
    if (pressed && !wasPressed) {
      this.pressedButtons.add(key);
      onPress();
      return;
    }
    if (!pressed && wasPressed) {
      this.pressedButtons.delete(key);
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
    this.exitHoldSeconds = 0;
    this.pressedButtons.clear();
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
