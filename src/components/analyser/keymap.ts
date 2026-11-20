/**
 * The one definition of keyboard shortcuts. The key handler, the cheat sheet,
 * the command palette and the toolbar's key legends all read this table, so a
 * binding cannot be shown one way and behave another.
 *
 * Key names: a letter is written lower-case ("r"), with "Shift+" when shifted
 * ("Shift+r"). Named keys use the browser's name ("ArrowLeft", "Escape") and
 * the space bar is "Space". Punctuation is written as typed ("?", "/"), since
 * which physical key produces it depends on the keyboard layout.
 */
export type ActionId =
  | "prevView"
  | "nextView"
  | "randomize"
  | "viewCycle"
  | "dynamicMode"
  | "prevLook"
  | "nextLook"
  | "randomLook"
  | "playLooks"
  | "responseDown"
  | "responseUp"
  | "tapBeat"
  | "tapDownbeat"
  | "fullscreen"
  | "hideControls"
  | "postFx"
  | "bpmGrid"
  | "latency"
  | "stats"
  | "settings"
  | "palette"
  | "help"
  | "inputSource";

export type KeyGroup = "Views" | "Presets" | "Feel" | "Display" | "Find & set up";

export type KeyBinding = {
  action: ActionId;
  label: string;
  group: KeyGroup;
  /** Keys to teach, primary first. */
  keys: readonly string[];
  /** Older keys that still work but are no longer shown. */
  legacy?: readonly string[];
};

export const KEY_BINDINGS: readonly KeyBinding[] = [
  {
    action: "prevView",
    label: "Previous view",
    group: "Views",
    keys: ["ArrowLeft"],
    legacy: ["b"],
  },
  { action: "nextView", label: "Next view", group: "Views", keys: ["ArrowRight"], legacy: ["v"] },
  { action: "randomize", label: "Randomize the look", group: "Views", keys: ["r"] },
  { action: "viewCycle", label: "Cycle views with the music", group: "Views", keys: ["c"] },
  {
    action: "dynamicMode",
    label: "Dynamic mode (camera and effects follow the music)",
    group: "Views",
    keys: ["d"],
  },

  {
    action: "prevLook",
    label: "Previous saved preset",
    group: "Presets",
    keys: ["ArrowUp"],
    legacy: ["Shift+ArrowLeft", "["],
  },
  {
    action: "nextLook",
    label: "Next saved preset",
    group: "Presets",
    keys: ["ArrowDown"],
    legacy: ["Shift+ArrowRight", "]"],
  },
  {
    action: "randomLook",
    label: "Random saved preset",
    group: "Presets",
    keys: ["Shift+r"],
    legacy: ["\\"],
  },
  {
    action: "playLooks",
    label: "Play or pause the presets",
    group: "Presets",
    keys: ["Space"],
    legacy: ["a"],
  },

  { action: "responseDown", label: "Calmer", group: "Feel", keys: ["-"] },
  { action: "responseUp", label: "Punchier", group: "Feel", keys: ["+"], legacy: ["="] },
  { action: "tapBeat", label: "Tap the beat", group: "Feel", keys: ["t"] },
  { action: "tapDownbeat", label: "Tap bar 1", group: "Feel", keys: ["Shift+t"] },

  { action: "fullscreen", label: "Fullscreen", group: "Display", keys: ["f"] },
  {
    action: "hideControls",
    label: "Hide or show the controls",
    group: "Display",
    keys: ["h"],
    legacy: ["g"],
  },
  { action: "postFx", label: "Effects on or off", group: "Display", keys: ["p"] },
  { action: "bpmGrid", label: "Tempo and bar display", group: "Display", keys: ["m"] },
  { action: "latency", label: "Latency display", group: "Display", keys: ["l"] },
  { action: "stats", label: "Stats for nerds", group: "Display", keys: ["n"] },

  { action: "palette", label: "Search everything", group: "Find & set up", keys: ["/"] },
  { action: "settings", label: "Settings", group: "Find & set up", keys: ["s"] },
  {
    action: "inputSource",
    label: "Choose the input source",
    group: "Find & set up",
    keys: ["i"],
    legacy: ["x"],
  },
  { action: "help", label: "Show these shortcuts", group: "Find & set up", keys: ["?"] },
];

/** Presets 1–9 load on the digit and are overwritten with Shift+digit. */
export const LOOK_DIGITS = 9;

const KEY_TO_ACTION = new Map<string, ActionId>();
for (const binding of KEY_BINDINGS) {
  for (const key of [...binding.keys, ...(binding.legacy ?? [])]) {
    if (KEY_TO_ACTION.has(key)) throw new Error(`Key "${key}" is bound twice`);
    KEY_TO_ACTION.set(key, binding.action);
  }
}

type KeyLike = { key: string; shiftKey?: boolean };

/** The table's name for a key event. */
export function keyName(e: KeyLike): string {
  if (e.key === " " || e.key === "Spacebar") return "Space";
  if (e.key.length === 1) {
    const lower = e.key.toLowerCase();
    const isLetter = lower !== e.key.toUpperCase();
    // Shift is part of how punctuation is typed, so it only counts for letters.
    return isLetter && e.shiftKey ? `Shift+${lower}` : lower;
  }
  return e.shiftKey ? `Shift+${e.key}` : e.key;
}

export function actionForKey(e: KeyLike): ActionId | null {
  return KEY_TO_ACTION.get(keyName(e)) ?? null;
}

const SYMBOLS: Record<string, string> = {
  ArrowLeft: "←",
  ArrowRight: "→",
  ArrowUp: "↑",
  ArrowDown: "↓",
  Space: "Space",
  Escape: "Esc",
};

/** How a key is printed on a key cap: "⇧R", "←", "Space". */
export function keyCap(key: string): string {
  const shifted = key.startsWith("Shift+");
  const base = shifted ? key.slice(6) : key;
  const text = SYMBOLS[base] ?? (base.length === 1 ? base.toUpperCase() : base);
  return shifted ? `⇧${text}` : text;
}

/** The primary key cap for an action, for buttons and menus. */
export function capFor(action: ActionId): string {
  const binding = KEY_BINDINGS.find((b) => b.action === action);
  return binding ? keyCap(binding.keys[0]!) : "";
}

/** Event that asks the toolbar to run an action, from the palette or cheat sheet. */
export const RUN_ACTION_EVENT = "spectrum-aura:run-action";
export function runAction(action: ActionId): void {
  window.dispatchEvent(new CustomEvent<ActionId>(RUN_ACTION_EVENT, { detail: action }));
}

/** Events that open the cheat sheet and the command palette. */
export const OPEN_HELP_EVENT = "spectrum-aura:open-help";
export const OPEN_PALETTE_EVENT = "spectrum-aura:open-palette";

/** Opens the settings panel filtered to a query (detail: the query string). */
export const FILTER_SETTINGS_EVENT = "spectrum-aura:filter-settings";
