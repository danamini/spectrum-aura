export type TextSnippet = {
  id: string;
  text: string;
  work?: string;
  author?: string;
  year?: string;
  sourceUrl: string;
  rights: string;
  creditLine?: string;
  attributionRequired: boolean;
  notes?: string;
};

/** A pluggable phrase feed for the demo-scene text overlay. Implementations
 * fetch/produce short attributed snippets in batches; `TextBuffer` handles
 * buffering, caching, and fallback so the render loop never waits on
 * `prefetch()`. */
export type TextSource = {
  id: string;
  label: string;
  prefetch(count: number): Promise<TextSnippet[]>;
};
