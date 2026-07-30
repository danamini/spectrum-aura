export type CommonsOverlayTopic = "abstract" | "technical" | "organic";

export type CommonsOverlayAsset = {
  kind: "commons";
  family: string;
  label: string;
  source: string;
  license: string;
  attributionRequired: boolean;
  author?: string;
  sourceUrl?: string;
  creditLine?: string;
  publicUrl: string;
};

type CommonsSearchSeed = {
  family: string;
  search: string;
};

const COMMONS_TOPIC_SEARCHES: Record<CommonsOverlayTopic, CommonsSearchSeed[]> = {
  abstract: [
    { family: "halftone", search: 'file:"abstract pattern"' },
    { family: "radial", search: 'file:"spiral pattern"' },
    { family: "grid", search: 'file:"geometric pattern"' },
  ],
  technical: [
    { family: "circuit", search: 'file:"circuit board"' },
    { family: "hud", search: "file:diagram" },
    { family: "grid", search: 'file:"grid pattern"' },
  ],
  organic: [
    { family: "wave", search: 'file:"leaf pattern"' },
    { family: "radial", search: 'file:"tree rings"' },
    { family: "flare", search: 'file:"botanical illustration"' },
  ],
};

type CommonsApiPage = {
  title: string;
  fullurl?: string;
  imageinfo?: Array<{
    thumburl?: string;
    url?: string;
    descriptionurl?: string;
    extmetadata?: Record<string, { value?: string }>;
  }>;
};

type CommonsApiResponse = {
  query?: {
    pages?: Record<string, CommonsApiPage>;
  };
};

function stripHtml(value: string | undefined) {
  if (!value) return "";
  // DOMParser yields an inert document: unlike innerHTML on a live-document
  // node, parsed <img>/<iframe> elements never fetch or run event handlers,
  // and extmetadata values are attacker-influenced remote HTML.
  const doc = new DOMParser().parseFromString(value, "text/html");
  return (doc.body.textContent ?? "").replace(/\s+/g, " ").trim();
}

async function fetchSearchSeed(
  seed: CommonsSearchSeed,
  limit: number,
): Promise<CommonsOverlayAsset[]> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: seed.search,
    gsrnamespace: "6",
    gsrlimit: String(limit),
    prop: "imageinfo|info",
    inprop: "url",
    iiprop: "url|extmetadata",
    iiurlwidth: "1024",
    format: "json",
    origin: "*",
  });

  const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`wikimedia commons request failed: ${response.status}`);
  }
  const body = (await response.json()) as CommonsApiResponse;
  const pages = Object.values(body.query?.pages ?? {});
  return pages
    .map((page): CommonsOverlayAsset | null => {
      const info = page.imageinfo?.[0];
      const metadata = info?.extmetadata ?? {};
      const publicUrl = info?.thumburl ?? info?.url;
      if (!publicUrl) return null;
      const label = stripHtml(metadata.ObjectName?.value) || page.title.replace(/^File:/, "");
      const author = stripHtml(metadata.Artist?.value) || undefined;
      const credit = stripHtml(metadata.Credit?.value) || undefined;
      const license =
        stripHtml(metadata.LicenseShortName?.value) ||
        stripHtml(metadata.UsageTerms?.value) ||
        "Unknown";
      const sourceUrl = info?.descriptionurl ?? page.fullurl;
      const attributionRequired =
        stripHtml(metadata.AttributionRequired?.value).toLowerCase() === "true";
      return {
        kind: "commons",
        family: seed.family,
        label,
        source: "Wikimedia Commons",
        license,
        attributionRequired,
        author,
        sourceUrl,
        creditLine: [label, author || credit || "Wikimedia Commons", license]
          .filter(Boolean)
          .join(" — "),
        publicUrl,
      };
    })
    .filter((entry): entry is CommonsOverlayAsset => entry !== null);
}

export async function fetchWikimediaCommonsOverlayAssets(
  topic: CommonsOverlayTopic,
  count = 9,
): Promise<CommonsOverlayAsset[]> {
  const seeds = COMMONS_TOPIC_SEARCHES[topic];
  const perSeed = Math.max(1, Math.ceil(count / seeds.length));
  // One rate-limited/failed seed must not discard the seeds that succeeded;
  // only reject (so callers back off) when every seed failed.
  const settled = await Promise.allSettled(seeds.map((seed) => fetchSearchSeed(seed, perSeed)));
  const batches = settled.flatMap((result) =>
    result.status === "fulfilled" ? [result.value] : [],
  );
  if (batches.length === 0) {
    const firstFailure = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw firstFailure?.reason ?? new Error("wikimedia commons request failed");
  }
  const seen = new Set<string>();
  return batches
    .flat()
    .filter((entry) => {
      const key = entry.sourceUrl ?? entry.publicUrl;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, count);
}
