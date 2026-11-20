import * as React from "react";
import { ChevronDown, Pin } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  DEFAULT_SETTINGS,
  settingsStore,
  useSettings,
  type FxLockId,
  type Settings,
} from "../store";
import { PanelFilterContext } from "./panel-filter";

/**
 * A view's own settings, shortest first: the first few controls are shown,
 * the rest sit behind "More". Views list their controls in order of how much
 * they change the picture, so the head of the list is the useful part.
 */
export function ViewControls({
  headline = 4,
  first,
  children,
}: {
  headline?: number;
  /** Labels of controls to move to the front, for views whose own order
   * does not lead with what matters most. */
  first?: readonly string[];
  children: React.ReactNode;
}) {
  const { searching } = React.useContext(PanelFilterContext);
  const [more, setMore] = React.useState(false);
  // Each view contributes one fragment; unwrap it to count its controls.
  const controls = React.Children.toArray(children).flatMap((child) =>
    React.isValidElement<{ children?: React.ReactNode }>(child) && child.type === React.Fragment
      ? React.Children.toArray(child.props.children)
      : [child],
  );
  if (first && first.length > 0) {
    const rank = (node: React.ReactNode) => {
      const label = React.isValidElement<{ label?: string }>(node) ? node.props.label : undefined;
      const at = label ? first.indexOf(label) : -1;
      return at < 0 ? first.length : at;
    };
    // Array.prototype.sort is stable, so everything not named keeps its order.
    controls.sort((a, b) => rank(a) - rank(b));
  }
  if (controls.length <= headline + 1) return <>{controls}</>;
  const open = more || searching;
  return (
    <>
      {controls.slice(0, headline)}
      {open && controls.slice(headline)}
      {!searching && (
        <button
          type="button"
          onClick={() => setMore((value) => !value)}
          aria-expanded={open}
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-white/10 bg-white/[0.02] py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/50 hover:text-white"
        >
          {open ? "Fewer controls" : `More controls (${controls.length - headline})`}
          <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      )}
    </>
  );
}

// Cooler, clearer toggle switch with explicit ON/OFF affordance
export function Sw({
  checked,
  onCheckedChange,
  disabled = false,
  k,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
  /** The setting this switch edits; marks it when off its default. */
  k?: keyof Settings;
}) {
  const fallback = k ? DEFAULT_SETTINGS[k] : undefined;
  const changed = typeof fallback === "boolean" && fallback !== checked;
  return (
    <span className="flex items-center gap-2" data-k={k} data-changed={changed || undefined}>
      {changed && (
        <button
          type="button"
          onClick={() => onCheckedChange(fallback)}
          title={`Changed. Click to return to the default (${fallback ? "on" : "off"}).`}
          aria-label="Reset this switch to its default"
          className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)] hover:scale-150"
        />
      )}
      <Switch
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        className={
          "h-5 w-10 border border-white/15 " +
          "data-[state=checked]:bg-emerald-400 data-[state=checked]:border-emerald-300/60 data-[state=checked]:shadow-[0_0_10px_rgba(52,211,153,0.55)] " +
          "data-[state=unchecked]:bg-white/5"
        }
      />
    </span>
  );
}

// Mono-styled button shared across the panel
type BnVariant = "default" | "outline" | "ghost" | "primary";
export function Bn({
  active,
  variant = "outline",
  className = "",
  children,
  onClick,
  ...rest
}: {
  active?: boolean;
  variant?: BnVariant;
  className?: string;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [ripples, setRipples] = React.useState<
    { id: number; x: number; y: number; size: number }[]
  >([]);
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top - size / 2;
    const id = Date.now() + Math.random();
    setRipples((r) => [...r, { id, x, y, size }]);
    setTimeout(() => setRipples((r) => r.filter((p) => p.id !== id)), 600);
    onClick?.(e);
  };
  const base =
    "relative overflow-hidden inline-flex items-center justify-center gap-1 rounded-md px-2.5 h-7 font-mono text-[10px] uppercase tracking-[0.18em] " +
    "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black disabled:opacity-40 disabled:pointer-events-none [&_svg]:pointer-events-none [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0";
  let look = "";
  if (active) {
    look =
      "bg-emerald-400 text-black border border-emerald-300/60 shadow-[0_0_10px_rgba(52,211,153,0.45)] hover:bg-emerald-300";
  } else if (variant === "primary") {
    look = "bg-white text-black border border-white hover:bg-white/90";
  } else if (variant === "ghost") {
    look = "text-white/60 hover:text-white hover:bg-white/5 border border-transparent";
  } else if (variant === "default") {
    look = "bg-white/10 text-white/90 border border-white/15 hover:bg-white/15";
  } else {
    look = "bg-transparent text-white/70 border border-white/15 hover:bg-white/5 hover:text-white";
  }
  return (
    <button {...rest} onClick={handleClick} className={`${base} ${look} ${className}`}>
      {children}
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full bg-white/40 animate-ripple"
          style={{ left: r.x, top: r.y, width: r.size, height: r.size }}
        />
      ))}
    </button>
  );
}

export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2" data-ctl={label}>
      <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">
        {label}
      </Label>
      {children}
    </div>
  );
}

export function ToggleRow({
  label,
  enabled,
  onToggle,
  lockId,
  disabled = false,
  children,
}: {
  label: string;
  enabled: boolean;
  disabled?: boolean;
  onToggle: (v: boolean) => void;
  /** When set, shows a pin that excludes this effect group from Randomize. */
  lockId?: FxLockId;
  children?: React.ReactNode;
}) {
  const settings = useSettings();
  const filter = React.useContext(PanelFilterContext);
  const locked = lockId ? settings.fxLocks.includes(lockId) : false;
  const toggleLock = () => {
    if (!lockId) return;
    const locks = settings.fxLocks;
    settingsStore.set({
      fxLocks: locks.includes(lockId) ? locks.filter((id) => id !== lockId) : [...locks, lockId],
    });
  };
  if (filter.activeOnly && filter.inEffectSection && !enabled && !filter.searching) return null;
  return (
    <div
      data-ctl={label}
      className={`rounded-md border p-3 space-y-3 transition-colors ${enabled ? "border-emerald-400/30 bg-emerald-400/[0.04]" : "border-white/5 bg-white/[0.02]"}`}
    >
      <div className="flex items-center justify-between gap-2">
        <Label className="flex items-center gap-2 text-[11px] font-medium tracking-wide">
          <span
            className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]" : "bg-white/20"}`}
          />
          {label}
          <span
            className={`ml-1 font-mono text-[9px] uppercase tracking-wider ${enabled ? "text-emerald-300/80" : "text-white/30"}`}
          >
            {enabled ? "ON" : "OFF"}
          </span>
        </Label>
        <div className="flex items-center gap-1.5">
          {lockId && (
            <button
              type="button"
              onClick={toggleLock}
              title={
                locked
                  ? "Pinned — Randomize, presets and view cycling all leave this effect untouched. Click to unpin."
                  : "Pin to lock this effect in place — Randomize, presets and view cycling won't change it."
              }
              aria-pressed={locked}
              className={`rounded p-1 transition-colors ${
                locked
                  ? "bg-amber-400/20 text-amber-300 hover:bg-amber-400/30"
                  : "text-white/25 hover:bg-white/10 hover:text-white/70"
              }`}
            >
              <Pin className={`h-3.5 w-3.5 ${locked ? "fill-current" : ""}`} />
            </button>
          )}
          <Sw checked={enabled} onCheckedChange={onToggle} disabled={disabled} />
        </div>
      </div>
      {enabled && children}
    </div>
  );
}

const FX_SECTIONS_KEY = "analyser-fx-sections-v1";

function readFxSectionOpen(id: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const raw = localStorage.getItem(FX_SECTIONS_KEY);
    if (raw) return Boolean((JSON.parse(raw) as Record<string, boolean>)[id]);
  } catch {
    return false;
  }
  return false;
}

/**
 * Collapsible themed group for the Post FX tab. Collapsed by default so the
 * tab reads as a short table of contents; each header shows how many effects
 * inside are active. Open state persists per section across sessions.
 */
export function FxSection({
  id,
  label,
  count,
  pinned = 0,
  children,
}: {
  id: string;
  label: string;
  count: number;
  /** How many effects inside are pinned against Randomize. */
  pinned?: number;
  children: React.ReactNode;
}) {
  const filter = React.useContext(PanelFilterContext);
  const [stored, setOpen] = React.useState(() => readFxSectionOpen(id));
  // In active-only mode a section is just the frame around what is on.
  const open = stored || filter.searching || (filter.activeOnly && count > 0);
  const toggle = () =>
    setOpen((o) => {
      const next = !o;
      try {
        const raw = localStorage.getItem(FX_SECTIONS_KEY);
        const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
        map[id] = next;
        localStorage.setItem(FX_SECTIONS_KEY, JSON.stringify(map));
      } catch {
        return next;
      }
      return next;
    });
  if (filter.activeOnly && count === 0 && !filter.searching) return null;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03]" data-ctl={label}>
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2.5 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
      >
        <span className="flex items-center gap-2">
          {label}
          <span
            className={`rounded px-1.5 py-0.5 text-[9px] tracking-wider ${
              count > 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-white/5 text-white/30"
            }`}
          >
            {count > 0 ? `${count} on` : "off"}
          </span>
          <span
            title={
              pinned > 0
                ? `${pinned} locked against Randomize, presets and view cycling`
                : "No effects locked — pin an effect to keep it through Randomize, presets and view cycling"
            }
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] tracking-wider ${
              pinned > 0 ? "bg-amber-400/15 text-amber-300" : "bg-white/5 text-white/30"
            }`}
          >
            <Pin className={`h-2.5 w-2.5 ${pinned > 0 ? "fill-current" : ""}`} />
            {pinned} locked
          </span>
        </span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <PanelFilterContext.Provider value={{ ...filter, inEffectSection: true }}>
          <div className="space-y-3 border-t border-white/10 p-3">{children}</div>
        </PanelFilterContext.Provider>
      )}
    </div>
  );
}

export function S({
  label,
  value,
  min,
  max,
  step,
  onChange,
  k,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  /** The setting this slider edits. With it, the slider marks itself when
   * moved off its default and offers a one-click way back. */
  k?: keyof Settings;
}) {
  const fallback = k ? DEFAULT_SETTINGS[k] : undefined;
  const changed = typeof fallback === "number" && Math.abs(value - fallback) > step / 2;
  return (
    <div
      className="space-y-1"
      data-ctl={label || undefined}
      data-k={k}
      data-changed={changed || undefined}
    >
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-white/40">
        <span className="flex items-center gap-1.5">
          {changed && (
            <button
              type="button"
              onClick={() => onChange(fallback)}
              title={`Changed. Click to return to the default (${fallback}).`}
              aria-label={`Reset ${label || "this setting"} to its default`}
              className="h-1.5 w-1.5 rounded-full bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.7)] hover:scale-150"
            />
          )}
          {label}
        </span>
        <span className="tabular-nums text-white/70">
          {value.toFixed(step < 0.01 ? 4 : step < 0.1 ? 2 : 1)}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0])}
      />
    </div>
  );
}

/**
 * Collapsible "Advanced" section for settings that are rarely touched day to
 * day (fine-tuning knobs, novelty effects) — keeps the tab's default view
 * short without removing anything. Collapsed by default unless `defaultOpen`.
 */
export function Disclosure({
  label,
  defaultOpen = false,
  children,
}: {
  label: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const { searching } = React.useContext(PanelFilterContext);
  const [stored, setOpen] = React.useState(defaultOpen);
  const open = stored || searching;
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03]" data-ctl={label}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-white/60 hover:text-white"
      >
        <span>{label}</span>
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-3 border-t border-white/10 p-3">{children}</div>}
    </div>
  );
}

export { Label };
