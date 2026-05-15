import { beforeEach, describe, expect, it, vi } from "vitest";

import { probeWebXrSupport } from "./xr";

describe("WebXR support probe", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {},
    });
  });

  it("returns false when WebXR is unavailable", async () => {
    await expect(probeWebXrSupport()).resolves.toBe(false);
  });

  it("returns true when immersive-vr is supported", async () => {
    const isSessionSupported = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, "navigator", {
      configurable: true,
      value: {
        xr: {
          isSessionSupported,
        },
      },
    });

    await expect(probeWebXrSupport()).resolves.toBe(true);
    expect(isSessionSupported).toHaveBeenCalledWith("immersive-vr");
  });
});
