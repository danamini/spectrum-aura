import { beforeEach, describe, expect, it, vi } from "vitest";
import { TextBuffer } from "../text-buffer";
import type { TextSnippet, TextSource } from "../types";

const snippet = (id: string, text: string): TextSnippet => ({
  id,
  text,
  sourceUrl: "https://example.com/source",
  rights: "Public Domain",
  attributionRequired: false,
});

function createStorageMock(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.has(key) ? data.get(key)! : null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    },
  };
}

function createSource(overrides: Partial<TextSource> = {}): TextSource {
  return {
    id: "test-source",
    label: "Test Source",
    prefetch: vi.fn(async () => [
      snippet("n1", "network phrase 1"),
      snippet("n2", "network phrase 2"),
    ]),
    ...overrides,
  };
}

const FALLBACK = [snippet("f1", "fallback one"), snippet("f2", "fallback two")];
const CACHE_KEY = "text-buffer-test-cache";

describe("TextBuffer", () => {
  beforeEach(() => {
    const storage = createStorageMock();
    Object.defineProperty(globalThis, "localStorage", {
      value: storage,
      configurable: true,
      writable: true,
    });
    vi.useRealTimers();
  });

  it("next() never blocks and round-robins the fallback list when the queue and cache are empty", () => {
    const buffer = new TextBuffer(createSource(), FALLBACK, CACHE_KEY);
    expect(buffer.next()?.text).toBe("fallback one");
    expect(buffer.next()?.text).toBe("fallback two");
    expect(buffer.next()?.text).toBe("fallback one");
  });

  it("next() returns an empty string rather than throwing when there is no fallback either", () => {
    const buffer = new TextBuffer(createSource(), [], CACHE_KEY);
    expect(buffer.next()).toBeNull();
  });

  it("maybeRefill() pulls from the source and drains queued phrases before falling back", async () => {
    const source = createSource();
    const buffer = new TextBuffer(source, FALLBACK, CACHE_KEY);
    await buffer.maybeRefill();
    expect(source.prefetch).toHaveBeenCalledTimes(1);
    expect(buffer.next()?.text).toBe("network phrase 1");
    expect(buffer.next()?.text).toBe("network phrase 2");
    expect(buffer.next()?.text).toBe("fallback one");
  });

  it("does not double-fire a refill while one is already in flight (cooldown set before awaiting)", async () => {
    let resolvePrefetch: (value: TextSnippet[]) => void = () => {};
    const source = createSource({
      prefetch: vi.fn(
        () =>
          new Promise<TextSnippet[]>((resolve) => {
            resolvePrefetch = resolve;
          }),
      ),
    });
    const buffer = new TextBuffer(source, FALLBACK, CACHE_KEY);

    const first = buffer.maybeRefill();
    const second = buffer.maybeRefill();
    resolvePrefetch([snippet("n1", "network phrase 1")]);
    await Promise.all([first, second]);

    expect(source.prefetch).toHaveBeenCalledTimes(1);
  });

  it("does not refetch again within the cooldown window once the queue is topped up", async () => {
    const source = createSource();
    const buffer = new TextBuffer(source, FALLBACK, CACHE_KEY);
    await buffer.maybeRefill();
    await buffer.maybeRefill();
    expect(source.prefetch).toHaveBeenCalledTimes(1);
  });

  it("falls back silently and logs at most once per cooldown when prefetch rejects", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const source = createSource({ prefetch: vi.fn(async () => Promise.reject(new Error("boom"))) });
    const buffer = new TextBuffer(source, FALLBACK, CACHE_KEY);

    await expect(buffer.maybeRefill()).resolves.toBeUndefined();
    await expect(buffer.maybeRefill()).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(buffer.next()?.text).toBe("fallback one");

    warnSpy.mockRestore();
  });

  it("caches a successful batch to localStorage and loads it again on the next construction", async () => {
    const source = createSource();
    const first = new TextBuffer(source, FALLBACK, CACHE_KEY);
    await first.maybeRefill();

    const second = new TextBuffer(createSource({ prefetch: vi.fn() }), FALLBACK, CACHE_KEY);
    expect(second.next()?.text).toBe("network phrase 1");
    expect(second.next()?.text).toBe("network phrase 2");
  });

  it("ignores a corrupt cache entry instead of throwing", () => {
    localStorage.setItem(CACHE_KEY, "{not json");
    expect(() => new TextBuffer(createSource(), FALLBACK, CACHE_KEY)).not.toThrow();
  });
});
