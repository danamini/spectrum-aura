import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Analyser TDZ regression", () => {
  it("declares displayedView before composer reset key initialization", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/analyser/Analyser.tsx"),
      "utf8",
    );

    const displayedViewDecl = source.indexOf(
      "let displayedView: ViewMode = settingsRef.current.view;",
    );
    const resetKeyInit = source.indexOf("let lastComposerResetKey = `${displayedView}|");

    expect(displayedViewDecl).toBeGreaterThanOrEqual(0);
    expect(resetKeyInit).toBeGreaterThanOrEqual(0);
    expect(displayedViewDecl).toBeLessThan(resetKeyInit);
  });
});
