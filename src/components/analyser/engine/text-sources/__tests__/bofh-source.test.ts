import { afterEach, describe, expect, it, vi } from "vitest";
import { bofhTextSource, BOFH_FALLBACK_EXCUSES } from "../bofh-source";

describe("bofhTextSource", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses the { data: [{ excuse }] } response shape into a flat string array", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: [
              { id: 1, excuse: "The router is meditating." },
              { id: 2, excuse: "Cosmic rays flipped a bit." },
            ],
            meta: { count: 2, total: 453 },
            error: null,
          }),
          { status: 200 },
        ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const phrases = await bofhTextSource.prefetch(2);

    expect(fetchMock).toHaveBeenCalledWith("https://bofh.bombeck.io/v1/excuses/random?count=2");
    expect(phrases).toEqual(["The router is meditating.", "Cosmic rays flipped a bit."]);
  });

  it("throws when the API responds with a non-OK status, so callers fall back", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 503 })),
    );
    await expect(bofhTextSource.prefetch(5)).rejects.toThrow();
  });

  it("throws when the response has no usable phrases", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })),
    );
    await expect(bofhTextSource.prefetch(5)).rejects.toThrow();
  });

  it("propagates a network failure so TextBuffer's fallback path takes over", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("network down"))),
    );
    await expect(bofhTextSource.prefetch(5)).rejects.toThrow("network down");
  });

  it("ships a healthy embedded fallback list", () => {
    expect(BOFH_FALLBACK_EXCUSES.length).toBeGreaterThanOrEqual(50);
    for (const excuse of BOFH_FALLBACK_EXCUSES) {
      expect(typeof excuse).toBe("string");
      expect(excuse.length).toBeGreaterThan(0);
    }
  });
});
