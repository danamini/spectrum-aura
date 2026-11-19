import type { TextSnippet, TextSource } from "./types";

/** Original lines in the cracktro / scrolltext tradition. Bundled, no network. */
const GREETS: string[] = [
  "Greetings to everyone still watching at 4 AM",
  "This intro was coded in one night and it shows",
  "Respect to all sceners past and present",
  "More bobs than you can count",
  "Raster bars are a lifestyle",
  "No sprites were harmed in the making of this demo",
  "Press space to continue. There is no space.",
  "Coded by nobody. Music by everybody.",
  "Sixteen colours ought to be enough for anyone",
  "Shout out to the last free byte of memory",
  "Vertical blank is the only deadline",
  "Hello to the crew at the back of the hall",
  "Loading. Please flip the disk.",
  "Full frame rate or nothing",
  "Sine tables precalculated with love",
  "This scroller will wrap. So will you.",
  "Fat lines, thin budget",
  "Ask your parents about cassette loading",
  "We came for the plasma and stayed for the tunnel",
  "Copper list overflow. Send help.",
  "One more effect before the party ends",
  "Bass is just very slow treble",
  "Turn it up until the scanlines bend",
  "Greetings fly out across the phone lines",
  "End of text. Wrapping.",
  "Real coders count from zero",
  "The border is part of the screen if you believe",
  "Twisting tunnels since the beginning",
  "Cracked, trained and filled with love",
  "Keep the scene alive",
];

export const GREETS_SNIPPETS: TextSnippet[] = GREETS.map((text, index) => ({
  id: `greets-${index + 1}`,
  text,
  work: "Demo-scene scrollers",
  author: "Spectrum Aura",
  sourceUrl: "",
  rights: "Original text bundled with Spectrum Aura",
  creditLine: "Spectrum Aura scroller text",
  attributionRequired: false,
}));

/** Bundled-only: `TextBuffer` cycles the fallback list, so prefetch adds nothing. */
export const greetsTextSource: TextSource = {
  id: "greets",
  label: "Demo-scene scrollers",
  async prefetch(): Promise<TextSnippet[]> {
    return [];
  },
};
