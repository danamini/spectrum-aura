import { afterEach, describe, expect, it, vi } from "vitest";
import { VisualBalanceMonitor } from "../visual-balance-monitor";

afterEach(() => vi.restoreAllMocks());

function harness(cost: number) {
  const pixels = new Uint8ClampedArray(32 * 18 * 4).fill(100);
  const drawImage = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
    getImageData: () => ({ data: pixels }),
  } as unknown as CanvasRenderingContext2D);
  let calls = 0;
  vi.spyOn(performance, "now").mockImplementation(() => (calls++ % 2 === 0 ? 0 : cost));
  const monitor = new VisualBalanceMonitor();
  monitor.reset(0);
  return { monitor, source: document.createElement("canvas"), drawImage };
}

describe("visual balance sampling", () => {
  it("samples at most four times per second and resets temporary corrections", () => {
    const { monitor, source, drawImage } = harness(1);
    expect(monitor.sample(source, 249, 0.2, true)).toBeNull();
    expect(monitor.sample(source, 250, 0.2, true)?.sampleMs).toBe(1);
    expect(monitor.sample(source, 499, 0.2, true)).toBeNull();
    expect(monitor.sample(source, 500, 0.2, true)).not.toBeNull();
    expect(drawImage).toHaveBeenCalledTimes(2);
    monitor.balance.exposure = 1.8;
    monitor.balance.response = 2;
    monitor.reset(600);
    expect(monitor.balance.exposure).toBe(1);
    expect(monitor.balance.response).toBe(1);
    expect(monitor.sample(source, 849, 0.2, true)).toBeNull();
  });

  it("backs off costly readbacks and stops after three very slow samples", () => {
    const { monitor, source, drawImage } = harness(13);
    monitor.sample(source, 250, 0.2, true);
    monitor.sample(source, 500, 0.2, true);
    expect(monitor.sample(source, 750, 0.2, true)).toBeNull();
    expect(monitor.sample(source, 1500, 0.2, true)?.status).toBe("paused: sampling slow");
    expect(monitor.sample(source, 5000, 0.2, true)).toBeNull();
    expect(drawImage).toHaveBeenCalledTimes(3);
    expect(monitor.balance.exposure).toBe(1);
  });

  it("reports unavailable sampling once without breaking the render loop", () => {
    const { monitor, source, drawImage } = harness(1);
    drawImage.mockImplementation(() => {
      throw new Error("readback failed");
    });
    expect(monitor.sample(source, 250, 0.2, true)?.status).toBe("unavailable in this browser");
    expect(monitor.sample(source, 500, 0.2, true)).toBeNull();
    expect(drawImage).toHaveBeenCalledTimes(1);
  });
});
