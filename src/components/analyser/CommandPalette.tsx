import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { buildCommands, searchCommands, type Command } from "./command-items";
import { FILTER_SETTINGS_EVENT, OPEN_PALETTE_EVENT, runAction } from "./keymap";
import { settingsStore, useSettings, useSlots, type Settings } from "./store";

const TOGGLE_SETTINGS_PANEL_EVENT = "spectrum-aura:toggle-settings-panel";

/**
 * Type-to-find for the whole app: views, saved presets, effects, settings and
 * actions in one list. Opens on "/" or Cmd/Ctrl+K. On/off items stay open
 * after use so several can be flipped in a row; everything else closes it.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const settings = useSettings();
  const looks = useSlots();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const commands = useMemo(() => buildCommands(looks), [looks]);
  const results = useMemo(() => searchCommands(commands, query), [commands, query]);
  // Sliders are not in the index; a typed query can always be handed to the
  // settings panel, whose filter reaches every control. It is the last row.
  const trimmed = query.trim();
  const rows = results.length + (trimmed ? 1 : 0);
  const active = Math.min(cursor, Math.max(0, rows - 1));
  const filterSettings = () => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent(FILTER_SETTINGS_EVENT, { detail: trimmed }));
  };

  useEffect(() => {
    const show = () => {
      setQuery("");
      setCursor(0);
      setOpen(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((value) => {
          if (!value) {
            setQuery("");
            setCursor(0);
          }
          return !value;
        });
        return;
      }
      // The input exists only while the palette is open. If focus has left
      // it (a click on a row, or on the page), Esc must still close the
      // palette and typing must still reach the query.
      const input = inputRef.current;
      if (!input || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") setOpen(false);
      else if (document.activeElement !== input) input.focus();
    };
    window.addEventListener(OPEN_PALETTE_EVENT, show);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener(OPEN_PALETTE_EVENT, show);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  useEffect(() => {
    listRef.current
      ?.querySelector<HTMLElement>("[data-active='true']")
      ?.scrollIntoView?.({ block: "nearest" });
  }, [active, open]);

  if (!open) return null;

  const run = (command: Command) => {
    const r = command.run;
    if (r.type === "toggle") {
      const current = settingsStore.get()[r.key];
      settingsStore.set({ [r.key]: !current } as Partial<Settings>);
      return;
    }
    setOpen(false);
    if (r.type === "action") runAction(r.action);
    else if (r.type === "view") settingsStore.set({ view: r.view });
    else if (r.type === "look") {
      // Choosing a preset by hand stops any automatic cycling, as the toolbar does.
      settingsStore.set({ slotCycleMode: false, viewCycleMode: false });
      settingsStore.loadSlot(r.index);
    } else
      window.dispatchEvent(
        new CustomEvent(TOGGLE_SETTINGS_PANEL_EVENT, { detail: { tab: r.tab, open: true } }),
      );
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      setCursor(Math.min(rows - 1, active + 1));
    } else if (e.key === "ArrowUp") {
      setCursor(Math.max(0, active - 1));
    } else if (e.key === "Enter") {
      const command = results[active];
      if (command) run(command);
      else if (trimmed) filterSettings();
    } else {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/40 px-4 pt-[12vh]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        data-blocks-shortcuts="palette"
        aria-label="Search everything"
        className="w-full max-w-xl overflow-hidden rounded-lg border border-white/15 bg-black/90 text-white shadow-[0_0_60px_rgba(0,0,0,0.6)] backdrop-blur-xl"
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-white/40" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            placeholder="Find a view, preset, effect, setting or action"
            aria-label="Search"
            className="w-full bg-transparent font-mono text-[13px] text-white outline-none placeholder:text-white/30"
          />
          <kbd className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[9px] text-white/45">
            Esc
          </kbd>
        </div>
        <div
          ref={listRef}
          role="listbox"
          className="analyser-scroll max-h-[50vh] overflow-y-auto p-1.5"
        >
          {results.map((command, index) => {
            const isOn = command.toggle ? Boolean(settings[command.toggle]) : null;
            return (
              <button
                key={command.id}
                type="button"
                role="option"
                aria-selected={index === active}
                data-active={index === active}
                onMouseMove={() => setCursor(index)}
                onClick={() => run(command)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${
                  index === active ? "bg-emerald-400/15" : ""
                }`}
              >
                <span className="w-14 shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                  {command.kind}
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px]">{command.label}</span>
                {isOn !== null && (
                  <span
                    className={`shrink-0 font-mono text-[9px] uppercase tracking-wider ${
                      isOn ? "text-emerald-300" : "text-white/30"
                    }`}
                  >
                    {isOn ? "On" : "Off"}
                  </span>
                )}
                {command.cap && (
                  <kbd className="shrink-0 rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-white/55">
                    {command.cap}
                  </kbd>
                )}
              </button>
            );
          })}
          {trimmed && (
            <button
              type="button"
              role="option"
              aria-selected={active === results.length}
              data-active={active === results.length}
              onMouseMove={() => setCursor(results.length)}
              onClick={filterSettings}
              className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left ${
                active === results.length ? "bg-emerald-400/15" : ""
              }`}
            >
              <span className="w-14 shrink-0 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
                Setting
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px]">
                Find “{trimmed}” in settings, including sliders
              </span>
            </button>
          )}
        </div>
        <div className="flex gap-4 border-t border-white/10 px-4 py-2 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
          <span>↑ ↓ move</span>
          <span>Enter choose</span>
          <span>On/off items stay open</span>
        </div>
      </div>
    </div>
  );
}
