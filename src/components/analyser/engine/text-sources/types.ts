/** A pluggable phrase feed for the demo-scene text overlay. Implementations
 * fetch/produce short strings in batches; `TextBuffer` handles buffering,
 * caching, and fallback so the render loop never waits on `prefetch()`. */
export type TextSource = {
  id: string;
  label: string;
  prefetch(count: number): Promise<string[]>;
};
