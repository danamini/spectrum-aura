import { measureFrame, VisualBalance } from "@spectrum-aura/engine/visual-balance";

export const BALANCE_STATE_EVENT = "spectrum-aura:balance-state";
export type BalanceState = { status: string; exposure: number; response: number; sampleMs: number };

/** Four tiny readbacks/second at most; expensive readbacks automatically back off. */
export class VisualBalanceMonitor {
  readonly balance = new VisualBalance();
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;
  private previous = new Float32Array(32 * 18);
  private hasPrevious = false;
  private nextAt = 0;
  private lastAt = 0;
  private interval = 250;
  private slowSamples = 0;
  private disabled = false;

  reset(now: number) {
    this.balance.reset();
    this.hasPrevious = false;
    this.nextAt = now + 250;
    this.lastAt = now;
    this.slowSamples = 0;
    this.disabled = false;
    this.interval = 250;
  }

  sample(
    source: HTMLCanvasElement,
    now: number,
    energy: number,
    active: boolean,
  ): BalanceState | null {
    if (this.disabled || now < this.nextAt) return null;
    this.nextAt = now + this.interval;
    const start = performance.now();
    try {
      if (!this.canvas) {
        this.canvas = document.createElement("canvas");
        this.canvas.width = 32;
        this.canvas.height = 18;
        this.context = this.canvas.getContext("2d", { willReadFrequently: true });
      }
      if (!this.context) throw new Error("Canvas sampling unavailable");
      // Must run immediately after render: the WebGL canvas does not preserve its drawing buffer.
      this.context.drawImage(source, 0, 0, 32, 18);
      const pixels = this.context.getImageData(0, 0, 32, 18).data;
      const frame = measureFrame(pixels, this.previous, this.balance.exposure, this.hasPrevious);
      this.hasPrevious = true;
      const dt = (now - this.lastAt) / 1000;
      this.lastAt = now;
      this.balance.tick(frame, dt, energy, active);
      const sampleMs = performance.now() - start;
      if (sampleMs > 4) this.interval = 1000;
      this.slowSamples = sampleMs > 12 ? this.slowSamples + 1 : 0;
      if (this.slowSamples >= 3) {
        this.disabled = true;
        this.balance.reset();
        return { status: "paused: sampling slow", exposure: 1, response: 1, sampleMs };
      }
      return {
        status: this.balance.status,
        exposure: this.balance.exposure,
        response: this.balance.response,
        sampleMs,
      };
    } catch {
      this.disabled = true;
      this.balance.reset();
      return { status: "unavailable in this browser", exposure: 1, response: 1, sampleMs: 0 };
    }
  }
}
