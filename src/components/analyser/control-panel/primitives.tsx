import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

// Cooler, clearer toggle switch with explicit ON/OFF affordance
export function Sw({
  checked,
  onCheckedChange,
  disabled = false,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
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
    <div className="space-y-2">
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
  children,
}: {
  label: string;
  enabled: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}) {
  return (
    <div
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
        <Sw checked={enabled} onCheckedChange={onToggle} />
      </div>
      {enabled && children}
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
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between font-mono text-[10px] uppercase tracking-wider text-white/40">
        <span>{label}</span>
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
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.03]">
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
