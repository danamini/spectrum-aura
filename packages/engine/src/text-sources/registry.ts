/**
 * The one list of text overlay sources. Settings types, normalisation, the
 * scene and the settings panel all read this, so a source added here appears
 * everywhere and cannot be half-registered.
 */
export const TEXT_SOURCES = [
  {
    id: "custom",
    label: "Your text",
    description: "Your own lines, one phrase per line. Nothing leaves this device.",
    network: false,
  },
  {
    id: "telemetry",
    label: "Live readout",
    description: "What the analyser hears right now: tempo, band levels, what is driving the mix.",
    network: false,
  },
  {
    id: "greets",
    label: "Scrollers",
    description: "Original demo-scene greetings and scrolltext one-liners, bundled with the app.",
    network: false,
  },
  {
    id: "public-domain",
    label: "Literature",
    description: "Quotations from classic public-domain novels, bundled with the app.",
    network: false,
  },
  {
    id: "poetry",
    label: "Poetry",
    description: "Single lines of public-domain poetry, fetched from PoetryDB.",
    network: true,
  },
  {
    id: "wikipedia",
    label: "Wikipedia",
    description: "Random English Wikipedia article titles — short, strange and endless.",
    network: true,
  },
  {
    id: "bofh",
    label: "IT excuses",
    description: "Tongue-in-cheek system-administrator excuses from bofh.bombeck.io.",
    network: true,
  },
] as const;

export type TextSourceId = (typeof TEXT_SOURCES)[number]["id"];
export const TEXT_SOURCE_IDS = TEXT_SOURCES.map((source) => source.id) as TextSourceId[];

export function isTextSourceId(value: unknown): value is TextSourceId {
  return typeof value === "string" && (TEXT_SOURCE_IDS as string[]).includes(value);
}

/** Text overlay styles. The first four draw whole phrases; the rest animate
 * every character on its own. */
export const TEXT_STYLES = [
  { id: "bounce", label: "Bounce", perCharacter: false },
  { id: "scroller", label: "Scroller", perCharacter: false },
  { id: "stack", label: "Stack", perCharacter: false },
  { id: "orbit", label: "Orbit", perCharacter: false },
  { id: "wave", label: "Wave", perCharacter: true },
  { id: "typewriter", label: "Typewriter", perCharacter: true },
  { id: "assemble", label: "Assemble", perCharacter: true },
  { id: "ring", label: "Ring", perCharacter: true },
  { id: "rain", label: "Rain", perCharacter: true },
] as const;

export type TextStyleId = (typeof TEXT_STYLES)[number]["id"];
export const TEXT_STYLE_IDS = TEXT_STYLES.map((style) => style.id) as TextStyleId[];

export function isTextStyleId(value: unknown): value is TextStyleId {
  return typeof value === "string" && (TEXT_STYLE_IDS as string[]).includes(value);
}
