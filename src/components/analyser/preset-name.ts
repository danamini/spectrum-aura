import { DEFAULT_SETTINGS, type Settings } from "@spectrum-aura/engine/settings";
import { VISUALS } from "@spectrum-aura/engine/visuals";
import { EFFECT_TOGGLES } from "./command-items";

/**
 * Name for a preset saved without one: the view, plus the first effect that
 * is switched on beyond the defaults ("Outrun · Kaleidoscope"). A number is
 * added only when that name is already in the list.
 */
export function presetName(settings: Settings, taken: ReadonlyArray<string>): string {
  const view = VISUALS.find((v) => v.id === settings.view)?.label ?? "Preset";
  const effect = settings.postFxEnabled
    ? EFFECT_TOGGLES.find((e) => settings[e.key] === true && DEFAULT_SETTINGS[e.key] !== true)
    : undefined;
  const base = effect ? `${view} · ${effect.label}` : view;
  if (!taken.includes(base)) return base;
  for (let n = 2; ; n += 1) {
    const name = `${base} ${n}`;
    if (!taken.includes(name)) return name;
  }
}
