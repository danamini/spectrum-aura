import { describe, expect, it } from "vitest";

import { PUBLIC_DOMAIN_FALLBACK_SNIPPETS, publicDomainTextSource } from "../public-domain-source";

describe("publicDomainTextSource", () => {
  it("ships a bundled public-domain fallback set with provenance", () => {
    expect(PUBLIC_DOMAIN_FALLBACK_SNIPPETS.length).toBeGreaterThanOrEqual(12);
    for (const entry of PUBLIC_DOMAIN_FALLBACK_SNIPPETS) {
      expect(entry.text.length).toBeGreaterThan(0);
      expect(entry.sourceUrl.startsWith("https://")).toBe(true);
      expect(entry.rights).toBe("Public Domain");
    }
  });

  it("returns attributed snippets without touching the network", async () => {
    const batch = await publicDomainTextSource.prefetch(5);

    expect(batch).toHaveLength(5);
    expect(batch.every((entry) => entry.rights === "Public Domain")).toBe(true);
    expect(batch.every((entry) => Boolean(entry.author && entry.work))).toBe(true);
  });
});
