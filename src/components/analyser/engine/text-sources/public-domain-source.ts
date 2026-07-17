import snippets from "./public-domain-snippets.json";
import type { TextSnippet, TextSource } from "./types";

const PUBLIC_DOMAIN_SNIPPETS = snippets as TextSnippet[];

function shuffledCopy<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

export const PUBLIC_DOMAIN_FALLBACK_SNIPPETS: TextSnippet[] = PUBLIC_DOMAIN_SNIPPETS;

export const publicDomainTextSource: TextSource = {
  id: "public-domain",
  label: "Public Domain Library",
  async prefetch(count: number): Promise<TextSnippet[]> {
    if (PUBLIC_DOMAIN_SNIPPETS.length === 0) return [];
    const shuffled = shuffledCopy(PUBLIC_DOMAIN_SNIPPETS);
    const batch: TextSnippet[] = [];
    while (batch.length < count) {
      batch.push(...shuffled.slice(0, Math.min(shuffled.length, count - batch.length)));
    }
    return batch.slice(0, count);
  },
};
