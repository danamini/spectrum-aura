import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENGINE_HOOK = "src/components/analyser/hooks/useAnalyserEngine.ts";

describe("Analyser engine render-loop regression", () => {
  it("declares displayedView before composer reset key tracking state", () => {
    const source = readFileSync(join(process.cwd(), ENGINE_HOOK), "utf8");

    const displayedViewDecl = source.match(
      /let\s+displayedView\s*:\s*ViewMode\s*=\s*settingsRef\.current\.view\s*;/,
    );
    const resetKeyInit = source.match(/let\s+lastResetView\s*:\s*ViewMode\s*\|\s*null\s*=\s*null\s*;/);

    expect(displayedViewDecl).not.toBeNull();
    expect(resetKeyInit).not.toBeNull();
    expect(displayedViewDecl?.index ?? -1).toBeLessThan(resetKeyInit?.index ?? -1);
  });

  it("does not call removed barTiming React setters from the render loop", () => {
    const source = readFileSync(join(process.cwd(), ENGINE_HOOK), "utf8");

    expect(source).not.toMatch(/\bsetBarTiming\b/);
    expect(source).toMatch(/\bsetLiveTempoFrame\b/);
    expect(source).toMatch(/\bdispatchLiveTempo\b/);
  });
});
