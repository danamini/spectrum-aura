import { useEffect, useState } from "react";
import { KEY_BINDINGS, LOOK_DIGITS, OPEN_HELP_EVENT, keyCap, type KeyGroup } from "./keymap";

const GROUPS: KeyGroup[] = ["Views", "Presets", "Feel", "Display", "Find & set up"];

function Cap({ children }: { children: string }) {
  return (
    <kbd className="min-w-[1.6rem] rounded border border-white/20 bg-white/[0.06] px-1.5 py-0.5 text-center font-mono text-[11px] text-white/85">
      {children}
    </kbd>
  );
}

/** Every shortcut on one sheet, drawn from the same table the keys run from. */
export function CheatSheet() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const toggle = () => setOpen((value) => !value);
    window.addEventListener(OPEN_HELP_EVENT, toggle);
    return () => window.removeEventListener(OPEN_HELP_EVENT, toggle);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[190] flex items-center justify-center bg-black/55 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        data-blocks-shortcuts="sheet"
        className="analyser-scroll max-h-[88vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-white/15 bg-black/90 p-6 text-white backdrop-blur-xl"
      >
        <div className="mb-5 flex items-baseline justify-between">
          <h2 className="font-mono text-[12px] uppercase tracking-[0.3em] text-white/80">
            Keyboard shortcuts
          </h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/45 hover:text-white"
          >
            close · Esc
          </button>
        </div>
        <div className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
          {GROUPS.map((group) => (
            <section key={group}>
              <h3 className="mb-2 font-mono text-[10px] uppercase tracking-[0.22em] text-emerald-300/80">
                {group}
              </h3>
              <ul className="space-y-1.5">
                {KEY_BINDINGS.filter((binding) => binding.group === group).map((binding) => (
                  <li key={binding.action} className="flex items-center justify-between gap-4">
                    <span className="text-[12px] text-white/75">{binding.label}</span>
                    <span className="flex shrink-0 gap-1">
                      {binding.keys.map((key) => (
                        <Cap key={key}>{keyCap(key)}</Cap>
                      ))}
                    </span>
                  </li>
                ))}
                {group === "Presets" && (
                  <>
                    <li className="flex items-center justify-between gap-4">
                      <span className="text-[12px] text-white/75">Load preset 1–{LOOK_DIGITS}</span>
                      <span className="flex shrink-0 gap-1">
                        <Cap>1</Cap>
                        <Cap>…</Cap>
                        <Cap>{String(LOOK_DIGITS)}</Cap>
                      </span>
                    </li>
                    <li className="flex items-center justify-between gap-4">
                      <span className="text-[12px] text-white/75">Save over that preset</span>
                      <span className="flex shrink-0 gap-1">
                        <Cap>⇧1</Cap>
                        <Cap>…</Cap>
                        <Cap>{`⇧${LOOK_DIGITS}`}</Cap>
                      </span>
                    </li>
                  </>
                )}
                {group === "Find & set up" && (
                  <li className="flex items-center justify-between gap-4">
                    <span className="text-[12px] text-white/75">Search, from anywhere</span>
                    <span className="flex shrink-0 gap-1">
                      <Cap>⌘K</Cap>
                    </span>
                  </li>
                )}
              </ul>
            </section>
          ))}
        </div>
        <p className="mt-6 border-t border-white/10 pt-3 font-mono text-[10px] leading-relaxed text-white/40">
          Esc closes whatever is open. Drag to orbit the camera and scroll to zoom in 3D views. The
          older keys (B, V, A, G, X and the brackets) still work.
        </p>
      </div>
    </div>
  );
}
