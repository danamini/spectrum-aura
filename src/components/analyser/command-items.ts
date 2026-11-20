import {
  DEFAULT_SETTINGS,
  FX_PIPELINE,
  FX_RANDOMIZE_GROUPS,
  type Settings,
} from "@spectrum-aura/engine/settings";
import { VISUALS } from "@spectrum-aura/engine/visuals";
import { KEY_BINDINGS, capFor, type ActionId } from "./keymap";

export type CommandKind = "Action" | "View" | "Preset" | "Effect" | "Setting" | "Panel";

export type Command = {
  id: string;
  kind: CommandKind;
  label: string;
  /** Extra words that should find this command. */
  keywords?: string;
  /** Key cap shown beside it, when it has a shortcut. */
  cap?: string;
  /** For on/off commands: the setting that holds the state. */
  toggle?: keyof Settings;
  run:
    | { type: "action"; action: ActionId }
    | { type: "view"; view: Settings["view"] }
    | { type: "look"; index: number }
    | { type: "toggle"; key: keyof Settings }
    | { type: "panel"; tab: string };
};

const EFFECT_LABELS = new Map<string, string>(FX_PIPELINE.map((fx) => [fx.id, fx.label]));

/** Every effect whose first key is a plain on/off switch. */
export const EFFECT_TOGGLES: ReadonlyArray<{ id: string; label: string; key: keyof Settings }> =
  FX_RANDOMIZE_GROUPS.flatMap((group) => {
    const key = group.keys[0] as keyof Settings;
    if (typeof DEFAULT_SETTINGS[key] !== "boolean") return [];
    return [{ id: group.id, label: EFFECT_LABELS.get(group.id) ?? group.id, key }];
  });

const SETTING_TOGGLES: ReadonlyArray<{ key: keyof Settings; label: string; keywords?: string }> = [
  { key: "postFxEnabled", label: "All effects", keywords: "post fx master" },
  { key: "cameraDrift", label: "Cinematic camera drift", keywords: "motion" },
  { key: "cameraBeat", label: "Beat-reactive bounce", keywords: "camera kick" },
  { key: "cameraMouse", label: "Mouse camera", keywords: "drag orbit" },
  { key: "evolveEnabled", label: "Dynamic mode", keywords: "director music camera" },
  { key: "viewCycleMode", label: "Cycle views with the music", keywords: "auto" },
  { key: "viewCycleRandomize", label: "Randomize effects on view switch" },
  { key: "randomizeViewSettings", label: "Randomize also changes view settings" },
  { key: "performance", label: "Performance mode", keywords: "fast low latency" },
  { key: "latencyOptimized", label: "Low-latency audio", keywords: "fast attack" },
  { key: "ambientMode", label: "Ambient mode", keywords: "no music synthetic" },
  { key: "showBPM", label: "Tempo and bar display", keywords: "bpm grid hud" },
  { key: "showLatency", label: "Latency display", keywords: "hud" },
];

export const PANEL_TABS = [
  { id: "view", label: "View" },
  { id: "post", label: "Effects" },
  { id: "scene", label: "Scene" },
  { id: "audio", label: "Audio" },
  { id: "saves", label: "Presets" },
  { id: "midi", label: "MIDI" },
] as const;

/** Everything the palette can find. Presets are passed in because they change. */
export function buildCommands(looks: ReadonlyArray<{ name: string }>): Command[] {
  const commands: Command[] = [];
  for (const binding of KEY_BINDINGS) {
    if (binding.action === "palette") continue;
    commands.push({
      id: `action:${binding.action}`,
      kind: "Action",
      label: binding.label,
      keywords: binding.group,
      cap: capFor(binding.action),
      run: { type: "action", action: binding.action },
    });
  }
  for (const visual of VISUALS) {
    commands.push({
      id: `view:${visual.id}`,
      kind: "View",
      label: visual.label,
      keywords: `${visual.id} scene visual`,
      run: { type: "view", view: visual.id as Settings["view"] },
    });
  }
  looks.forEach((look, index) => {
    commands.push({
      id: `look:${index}`,
      kind: "Preset",
      label: look.name,
      keywords: "saved save look",
      cap: index < 9 ? String(index + 1) : undefined,
      run: { type: "look", index },
    });
  });
  for (const effect of EFFECT_TOGGLES) {
    commands.push({
      id: `effect:${effect.id}`,
      kind: "Effect",
      label: effect.label,
      keywords: "post fx",
      toggle: effect.key,
      run: { type: "toggle", key: effect.key },
    });
  }
  for (const setting of SETTING_TOGGLES) {
    commands.push({
      id: `setting:${setting.key}`,
      kind: "Setting",
      label: setting.label,
      keywords: setting.keywords,
      toggle: setting.key,
      run: { type: "toggle", key: setting.key },
    });
  }
  for (const tab of PANEL_TABS) {
    commands.push({
      id: `panel:${tab.id}`,
      kind: "Panel",
      label: `${tab.label} settings`,
      keywords: "open panel",
      run: { type: "panel", tab: tab.id },
    });
  }
  return commands;
}

/**
 * Commands matching every word of `query`, best first: a label that starts
 * with the query, then a label containing it, then keyword matches.
 */
export function searchCommands(commands: readonly Command[], query: string, limit = 60): Command[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return commands.slice(0, limit);
  const whole = words.join(" ");
  const scored: Array<{ command: Command; score: number }> = [];
  for (const command of commands) {
    const label = command.label.toLowerCase();
    const haystack = `${label} ${command.kind.toLowerCase()} ${(command.keywords ?? "").toLowerCase()}`;
    if (!words.every((word) => haystack.includes(word))) continue;
    const score = label.startsWith(whole)
      ? 0
      : label.split(/[\s-]+/).some((part) => part.startsWith(words[0]!))
        ? 1
        : label.includes(whole)
          ? 2
          : 3;
    scored.push({ command, score });
  }
  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((entry) => entry.command);
}
