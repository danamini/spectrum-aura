import { DEFAULT_SETTINGS, type Settings } from "@spectrum-aura/engine/settings";

/** Session controls survive loading a look and do not make that look unsaved. */
const SESSION_KEYS = [
  "slotCycleMode",
  "slotCycleSeconds",
  "performance",
  "midiEnabled",
  "ambientMode",
  "showBPM",
  "showLatency",
  "randomizeViewSettings",
  "viewCycleMode",
  "viewCycleRandomize",
  "fxLocks",
  "visualResponse",
  "autoBalanceEnabled",
] as const satisfies readonly (keyof Settings)[];
const ignoredKeys = new Set<keyof Settings>([...SESSION_KEYS, "activePreset"]);
const lookKeys = (Object.keys(DEFAULT_SETTINGS) as (keyof Settings)[]).filter(
  (key) => !ignoredKeys.has(key),
);

export function sameSavedLook(a: Settings, b: Settings): boolean {
  return lookKeys.every(
    (key) => a[key] === b[key] || JSON.stringify(a[key]) === JSON.stringify(b[key]),
  );
}

export function preserveSessionSettings(current: Settings, loaded: Settings): Settings {
  return { ...loaded, ...Object.fromEntries(SESSION_KEYS.map((key) => [key, current[key]])) };
}
