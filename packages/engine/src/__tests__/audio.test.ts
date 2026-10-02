import { afterEach, describe, expect, it, vi } from "vitest";
import { AudioEngine } from "../audio";

function setup() {
  const analyser = {
    fftSize: 2048,
    frequencyBinCount: 1024,
    smoothingTimeConstant: 0,
    getByteFrequencyData: (bins: Uint8Array) => bins.fill(128),
  };
  const gain = { gain: { value: 0 }, connect: vi.fn(() => analyser) };
  const source = { connect: vi.fn(() => gain) };
  const ctx = {
    sampleRate: 48000,
    baseLatency: 0.01,
    createMediaStreamSource: vi.fn(() => source),
    createGain: () => gain,
    createAnalyser: () => analyser,
    resume: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  };
  vi.stubGlobal(
    "AudioContext",
    class {
      constructor() {
        return ctx;
      }
    },
  );
  const track = { stop: vi.fn() };
  const stream = {
    getTracks: () => [track],
    getAudioTracks: () => [track],
    getVideoTracks: () => [],
  } as unknown as MediaStream;
  return { ctx, stream, track, analyser };
}

afterEach(() => vi.unstubAllGlobals());

describe("AudioEngine resources", () => {
  it("reuses FFT storage when the size has not changed", () => {
    const { stream } = setup();
    const engine = new AudioEngine();
    engine.startStream(stream);
    const bins = engine.bins;
    engine.setFftSize(2048);
    expect(engine.bins).toBe(bins);
  });

  it("clears old spectrum and latency measurements when stopped", () => {
    const { stream, track, ctx } = setup();
    const engine = new AudioEngine();
    engine.startStream(stream);
    expect(engine.read(1).bass).toBeGreaterThan(0);
    engine.stop();
    const frame = engine.read(1);
    expect(frame.bins).toHaveLength(0);
    expect(Object.values(frame.timing)).toEqual(Array(7).fill(0));
    expect(engine.isRunning()).toBe(false);
    expect(track.stop).toHaveBeenCalledOnce();
    expect(ctx.close).toHaveBeenCalledOnce();
  });

  it("releases the incoming stream and context if graph setup fails", () => {
    const { stream, track, ctx } = setup();
    ctx.createMediaStreamSource.mockImplementation(() => {
      throw new Error("graph failed");
    });
    const engine = new AudioEngine();
    expect(() => engine.startStream(stream)).toThrow("graph failed");
    expect(track.stop).toHaveBeenCalledOnce();
    expect(ctx.close).toHaveBeenCalledOnce();
    expect(engine.isRunning()).toBe(false);
  });

  it("releases the incoming stream if AudioContext construction fails", () => {
    const { stream, track } = setup();
    vi.stubGlobal(
      "AudioContext",
      class {
        constructor() {
          throw new Error("unavailable");
        }
      },
    );
    const engine = new AudioEngine();
    expect(() => engine.startStream(stream)).toThrow("unavailable");
    expect(track.stop).toHaveBeenCalledOnce();
  });

  it("handles asynchronous close failures during teardown", async () => {
    const { stream, ctx } = setup();
    ctx.close.mockRejectedValue(new Error("already closed"));
    const engine = new AudioEngine();
    engine.startStream(stream);
    engine.stop();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(engine.isRunning()).toBe(false);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe("AudioEngine capture requests", () => {
  it.each(["startMic", "startSystem"] as const)(
    "discards %s completing after stop",
    async (method) => {
      const { stream, track } = setup();
      const capture = deferred<MediaStream>();
      vi.stubGlobal("navigator", {
        mediaDevices: {
          getUserMedia: () => capture.promise,
          getDisplayMedia: () => capture.promise,
        },
      });
      const engine = new AudioEngine();
      const pending = engine[method]();
      engine.stop();
      capture.resolve(stream);
      await pending;
      expect(track.stop).toHaveBeenCalledOnce();
      expect(engine.isRunning()).toBe(false);
    },
  );

  it("keeps the newest source when requests resolve out of order", async () => {
    const first = setup();
    const second = setup();
    const oldCapture = deferred<MediaStream>();
    vi.stubGlobal("navigator", {
      mediaDevices: {
        getUserMedia: vi
          .fn()
          .mockReturnValueOnce(oldCapture.promise)
          .mockResolvedValueOnce(second.stream),
      },
    });
    const engine = new AudioEngine();
    const oldRequest = engine.startMic();
    await engine.startMic();
    oldCapture.resolve(first.stream);
    await oldRequest;
    expect(engine.stream).toBe(second.stream);
    expect(first.track.stop).toHaveBeenCalledOnce();
    expect(second.track.stop).not.toHaveBeenCalled();
    engine.stop();
  });

  it("ignores a stale permission rejection after a new stream starts", async () => {
    const { stream } = setup();
    const capture = deferred<MediaStream>();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: () => capture.promise } });
    const engine = new AudioEngine();
    const pending = engine.startMic();
    engine.startStream(stream);
    capture.reject(new Error("permission denied"));
    expect(await pending).toBe(false);
    expect(engine.stream).toBe(stream);
    engine.stop();
  });
});
