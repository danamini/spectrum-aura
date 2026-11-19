import type { TextSnippet, TextSource } from "./types";

const API_URL = "https://poetrydb.org/random";
const MIN_LINE = 14;
const MAX_LINE = 64;

type Poem = { title?: unknown; author?: unknown; lines?: unknown };

/** Picks the lines of a poem that stand on their own as an overlay phrase. */
export function pickPoemLines(poem: Poem, perPoem = 2): TextSnippet[] {
  if (!Array.isArray(poem.lines)) return [];
  const title = typeof poem.title === "string" ? poem.title.trim() : "";
  const author = typeof poem.author === "string" ? poem.author.trim() : "";
  const out: TextSnippet[] = [];
  for (const raw of poem.lines) {
    if (out.length >= perPoem) break;
    if (typeof raw !== "string") continue;
    // Drop the trailing comma/semicolon a mid-sentence line break leaves behind.
    const text = raw.trim().replace(/[,;:—-]+$/, "");
    if (text.length < MIN_LINE || text.length > MAX_LINE) continue;
    out.push({
      id: `poetry-${title}-${out.length}-${text.slice(0, 12)}`,
      text,
      work: title,
      author,
      sourceUrl: "https://poetrydb.org/",
      rights: "Public domain (via PoetryDB)",
      creditLine: [author, title].filter(Boolean).join(", "),
      attributionRequired: false,
      notes: "Live network source.",
    });
  }
  return out;
}

/** PoetryDB — public-domain poetry, CORS-open. */
export const poetryTextSource: TextSource = {
  id: "poetry",
  label: "Poetry lines",
  async prefetch(count: number): Promise<TextSnippet[]> {
    const poems = Math.max(4, Math.ceil(count / 2));
    const response = await fetch(`${API_URL}/${poems}`, { credentials: "omit" });
    if (!response.ok) throw new Error(`poetry request failed: ${response.status}`);
    const body = (await response.json()) as unknown;
    if (!Array.isArray(body)) throw new Error("poetry response was not a list");
    const lines = body.flatMap((poem) => pickPoemLines(poem as Poem));
    if (lines.length === 0) throw new Error("poetry response had no usable lines");
    return lines.slice(0, count);
  },
};
