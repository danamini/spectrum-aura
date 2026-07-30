import type { TextSnippet, TextSource } from "./types";

const PREFETCH_COUNT = 25;
const REFILL_THRESHOLD = 6;
const COOLDOWN_MS = 45_000;
const CACHE_VERSION = 1;

type CachePayload = { version: number; snippets: TextSnippet[]; at: number };

/** Ring buffer over a swappable `TextSource`. `next()` is synchronous and
 * never blocks on network — callers on the render loop just call it. Network
 * refills happen opportunistically via `maybeRefill()`, gated by a cooldown
 * so a source is never hit more than once per window. */
export class TextBuffer {
  private queue: TextSnippet[] = [];
  private fallbackIndex = 0;
  private cooldownUntil = 0;
  private lastErrorLoggedAt = 0;

  constructor(
    private readonly source: TextSource,
    private readonly fallback: readonly TextSnippet[],
    private readonly cacheKey: string,
  ) {
    this.loadCache();
  }

  next(): TextSnippet | null {
    const value = this.queue.shift();
    if (value) return value;
    if (this.fallback.length === 0) return null;
    const phrase = this.fallback[this.fallbackIndex % this.fallback.length]!;
    this.fallbackIndex += 1;
    return phrase;
  }

  async maybeRefill(): Promise<void> {
    const now = Date.now();
    if (this.queue.length >= REFILL_THRESHOLD) return;
    if (now < this.cooldownUntil) return;
    // Set before awaiting so a second call made while this fetch is in
    // flight can't also pass the cooldown check and double-fire.
    this.cooldownUntil = now + COOLDOWN_MS;
    try {
      const snippets = await this.source.prefetch(PREFETCH_COUNT);
      if (snippets.length === 0) return;
      this.queue.push(...snippets);
      this.saveCache(snippets);
    } catch (err) {
      const errorNow = Date.now();
      if (errorNow - this.lastErrorLoggedAt > COOLDOWN_MS) {
        this.lastErrorLoggedAt = errorNow;
        console.warn(
          `[text-sources] ${this.source.id} prefetch failed, using fallback phrases`,
          err,
        );
      }
    }
  }

  private loadCache() {
    try {
      const raw = localStorage.getItem(this.cacheKey);
      if (!raw) return;
      const cached = JSON.parse(raw) as Partial<CachePayload>;
      if (cached?.version === CACHE_VERSION && Array.isArray(cached.snippets)) {
        this.queue.push(...cached.snippets.filter((entry): entry is TextSnippet => !!entry?.text));
      }
    } catch {
      // Corrupt/unavailable cache — fall through to network + fallback phrases.
    }
  }

  private saveCache(snippets: TextSnippet[]) {
    try {
      const payload: CachePayload = { version: CACHE_VERSION, snippets, at: Date.now() };
      localStorage.setItem(this.cacheKey, JSON.stringify(payload));
    } catch {
      // Storage full/unavailable (e.g. private browsing) — cache is a nice-to-have.
    }
  }
}
