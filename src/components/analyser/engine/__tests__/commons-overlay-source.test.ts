import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchWikimediaCommonsOverlayAssets } from "../commons-overlay-source";

describe("fetchWikimediaCommonsOverlayAssets", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("parses Commons imageinfo/extmetadata into overlay assets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              query: {
                pages: {
                  1: {
                    title: "File:Abstract Test.jpg",
                    fullurl: "https://commons.wikimedia.org/wiki/File:Abstract_Test.jpg",
                    imageinfo: [
                      {
                        thumburl: "https://upload.wikimedia.org/test-thumb.jpg",
                        url: "https://upload.wikimedia.org/test.jpg",
                        descriptionurl: "https://commons.wikimedia.org/wiki/File:Abstract_Test.jpg",
                        extmetadata: {
                          ObjectName: { value: "Abstract Test" },
                          Artist: { value: "<a href='/wiki/User:Example'>Example Artist</a>" },
                          LicenseShortName: { value: "CC BY-SA 4.0" },
                          AttributionRequired: { value: "true" },
                        },
                      },
                    ],
                  },
                },
              },
            }),
            { status: 200 },
          ),
      ),
    );

    const assets = await fetchWikimediaCommonsOverlayAssets("abstract", 1);

    expect(assets).toHaveLength(1);
    expect(assets[0]?.label).toBe("Abstract Test");
    expect(assets[0]?.author).toBe("Example Artist");
    expect(assets[0]?.license).toBe("CC BY-SA 4.0");
    expect(assets[0]?.source).toBe("Wikimedia Commons");
    expect(assets[0]?.attributionRequired).toBe(true);
  });
});
