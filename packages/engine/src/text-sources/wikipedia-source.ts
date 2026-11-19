import type { TextSnippet, TextSource } from "./types";

const API_URL =
  "https://en.wikipedia.org/w/api.php?action=query&list=random&rnnamespace=0&format=json&origin=*";
const MAX_TITLE = 48;

/** Turns a MediaWiki `list=random` response into title snippets. */
export function parseRandomTitles(body: unknown): TextSnippet[] {
  const random = (body as { query?: { random?: unknown } } | null)?.query?.random;
  if (!Array.isArray(random)) return [];
  const out: TextSnippet[] = [];
  for (const entry of random) {
    const title = (entry as { title?: unknown } | null)?.title;
    if (typeof title !== "string") continue;
    // Disambiguating suffixes read as noise on screen.
    const text = title.replace(/\s*\([^)]*\)\s*$/, "").trim();
    if (text.length < 3 || text.length > MAX_TITLE) continue;
    out.push({
      id: `wikipedia-${title}`,
      text,
      work: "Wikipedia",
      author: "Wikipedia contributors",
      sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, "_"))}`,
      rights: "Article title; Wikipedia text is CC BY-SA 4.0",
      creditLine: `Wikipedia: ${title}`,
      attributionRequired: false,
      notes: "Live network source.",
    });
  }
  return out;
}

/** Random English Wikipedia article titles — short, strange and endless. */
export const wikipediaTextSource: TextSource = {
  id: "wikipedia",
  label: "Wikipedia roulette",
  async prefetch(count: number): Promise<TextSnippet[]> {
    const response = await fetch(`${API_URL}&rnlimit=${Math.min(50, count + 10)}`, {
      credentials: "omit",
    });
    if (!response.ok) throw new Error(`wikipedia request failed: ${response.status}`);
    const titles = parseRandomTitles(await response.json());
    if (titles.length === 0) throw new Error("wikipedia response had no usable titles");
    return titles.slice(0, count);
  },
};
