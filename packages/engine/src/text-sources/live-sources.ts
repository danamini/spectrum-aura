import type { TextSnippet } from "./types";

const MAX_CUSTOM_LINES = 60;
const MAX_CUSTOM_CHARS = 90;

/** Your own lines, one phrase per line of the settings text box. */
export function customSnippets(text: string): TextSnippet[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().slice(0, MAX_CUSTOM_CHARS))
    .filter(Boolean)
    .slice(0, MAX_CUSTOM_LINES)
    .map((line, index) => ({
      id: `custom-${index}-${line}`,
      text: line,
      work: "Your text",
      author: "",
      sourceUrl: "",
      rights: "Entered by you",
      creditLine: "Your text",
      attributionRequired: false,
    }));
}

export type TelemetryInput = {
  bpm: number;
  bpmConfidence: number;
  bass: number;
  mid: number;
  high: number;
  centroid: number;
};

const pct = (v: number) => `${Math.round(Math.max(0, Math.min(1, v)) * 100)}%`;

/**
 * A readout of what the analyser is hearing right now. `index` walks the
 * templates so successive phrases show different facts.
 */
export function telemetrySnippet(input: TelemetryInput, index: number): TextSnippet {
  const locked = input.bpm > 0 && input.bpmConfidence > 0.45;
  const loudest =
    input.bass >= input.mid && input.bass >= input.high
      ? "bass"
      : input.mid >= input.high
        ? "mids"
        : "highs";
  const lines = [
    locked ? `${Math.round(input.bpm)} BPM locked` : "Listening for the beat",
    `Bass ${pct(input.bass)} · Mid ${pct(input.mid)} · High ${pct(input.high)}`,
    `Driven by the ${loudest}`,
    locked ? `Tempo confidence ${pct(input.bpmConfidence)}` : "Tempo unknown",
    `Brightness ${pct(input.centroid)}`,
    locked ? `One beat every ${Math.round(60000 / input.bpm)} ms` : "Tap T to set the tempo",
  ];
  const safe = ((index % lines.length) + lines.length) % lines.length;
  return {
    id: `telemetry-${index}`,
    text: lines[safe]!,
    work: "Live analysis",
    author: "Spectrum Aura",
    sourceUrl: "",
    rights: "Generated from the audio you are playing",
    creditLine: "Live analysis readout",
    attributionRequired: false,
  };
}
