import { afterEach, expect, it, vi } from "vitest";
import { LocalVideoSource } from "../../../../examples/video-loop/src/local-video-source";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

it("keeps one UI-kit animation loop across successful source selections", async () => {
  const { AudioEngine } = await import("../audio");
  vi.spyOn(AudioEngine.prototype, "startMic").mockResolvedValue(true);
  vi.spyOn(AudioEngine.prototype, "startSystem").mockResolvedValue(true);
  const request = vi.fn(() => 1);
  vi.stubGlobal("requestAnimationFrame", request);
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  document.body.innerHTML =
    '<button id="start-mic"></button><button id="start-tab"></button><button id="palette-btn"></button><div id="palette-name"></div><div id="eq"></div><div id="start-error"></div><div id="start-overlay"></div><div id="bpm"></div><div id="beat-dot"></div>';
  await import("../../../../examples/ui-kit/src/main");
  document.getElementById("start-mic")!.click();
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  document.getElementById("start-tab")!.click();
  await Promise.resolve();
  expect(request).toHaveBeenCalledOnce();
  window.dispatchEvent(new PageTransitionEvent("pagehide"));
  expect(cancelAnimationFrame).toHaveBeenCalledWith(1);
});

it("releases replaced file URLs and ignores an older playback completion", async () => {
  let complete!: () => void;
  const video = document.createElement("video");
  vi.spyOn(video, "play")
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          complete = resolve;
        }),
    )
    .mockResolvedValue(undefined);
  vi.spyOn(video, "pause").mockImplementation(() => {});
  vi.spyOn(video, "load").mockImplementation(() => {});
  const revoke = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: vi.fn().mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second"),
    revokeObjectURL: revoke,
  });
  const source = new LocalVideoSource(video);
  const first = source.load(new Blob(["first"]));
  expect(await source.load(new Blob(["second"]))).toBe(true);
  expect(revoke).toHaveBeenCalledExactlyOnceWith("blob:first");
  complete();
  expect(await first).toBe(false);
  expect(video.getAttribute("src")).toBe("blob:second");
  source.clear();
  source.clear();
  expect(revoke.mock.calls).toEqual([["blob:first"], ["blob:second"]]);
  expect(video.hasAttribute("src")).toBe(false);
});
