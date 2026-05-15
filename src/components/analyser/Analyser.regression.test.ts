import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Analyser TDZ regression", () => {
  it("declares displayedView before composer reset key initialization", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/analyser/Analyser.tsx"),
      "utf8",
    );

    const displayedViewDecl = source.match(
      /let\s+displayedView\s*:\s*ViewMode\s*=\s*settingsRef\.current\.view\s*;/,
    );
    const resetKeyInit = source.match(/let\s+lastComposerResetKey\s*=\s*`\$\{displayedView\}\|/);

    expect(displayedViewDecl).not.toBeNull();
    expect(resetKeyInit).not.toBeNull();
    expect(displayedViewDecl?.index ?? -1).toBeLessThan(resetKeyInit?.index ?? -1);
  });
});
