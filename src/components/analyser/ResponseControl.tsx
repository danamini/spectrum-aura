import { useEffect, useId, useState } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import { ShortcutTooltipContent } from "./ShortcutTooltipContent";
import * as Slider from "@radix-ui/react-slider";
import { RotateCcw, Activity } from "lucide-react";
import { VISUAL_RESPONSE } from "@spectrum-aura/engine/visual-response";
import { DEFAULT_SETTINGS, settingsStore, useSettings } from "./store";
import { BALANCE_STATE_EVENT, type BalanceState } from "./visual-balance-monitor";
import { HUD_GLASS } from "./theme";

export function ResponseControl({ showKeys = true }: { showKeys?: boolean }) {
  const {
    visualResponse = VISUAL_RESPONSE.default,
    autoBalanceEnabled = DEFAULT_SETTINGS.autoBalanceEnabled,
  } = useSettings();
  const [balance, setBalance] = useState<BalanceState>({
    status: "settling",
    exposure: 1,
    response: 1,
    sampleMs: 0,
  });
  useEffect(() => {
    const onBalance = (event: Event) => setBalance((event as CustomEvent<BalanceState>).detail);
    window.addEventListener(BALANCE_STATE_EVENT, onBalance);
    return () => window.removeEventListener(BALANCE_STATE_EVENT, onBalance);
  }, []);
  const descriptionId = useId();
  const labelId = useId();
  const neutral = visualResponse === VISUAL_RESPONSE.default;
  const valueText = `${visualResponse.toFixed(2)}×`;
  return (
    <div
      data-ui-control
      className={`pointer-events-auto w-[220px] rounded-xl border border-white/15 px-3 py-2 ${HUD_GLASS}`}
    >
      <div className="mb-2 flex items-center justify-between gap-3 font-mono">
        <span id={labelId} className="flex items-center gap-1.5 text-[10px] text-white/80">
          <Activity className="h-3 w-3 text-emerald-300" />
          Response
        </span>
        <div className="flex items-center gap-2">
          <output className="text-[11px] tabular-nums text-emerald-200">{valueText}</output>
          <button
            type="button"
            aria-label="Reset response to 1×"
            disabled={neutral}
            title="Reset response to 1×"
            onClick={() => settingsStore.set({ visualResponse: VISUAL_RESPONSE.default })}
            className="rounded p-1 text-white/65 hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-emerald-300 disabled:opacity-25 disabled:cursor-default"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none select-none items-center"
        min={Math.log2(VISUAL_RESPONSE.min)}
        max={Math.log2(VISUAL_RESPONSE.max)}
        step={VISUAL_RESPONSE.logStep}
        value={[Math.log2(visualResponse)]}
        onValueChange={([value]) =>
          settingsStore.set({ visualResponse: Number((2 ** value).toFixed(2)) })
        }
      >
        <Slider.Track className="relative h-1.5 grow overflow-hidden rounded-full bg-white/10">
          <Slider.Range className="absolute h-full rounded-full bg-gradient-to-r from-emerald-600/70 to-emerald-300" />
          <span className="pointer-events-none absolute left-1/2 top-0 h-full w-px bg-white/50" />
        </Slider.Track>
        <Slider.Thumb
          aria-labelledby={labelId}
          aria-describedby={descriptionId}
          aria-valuetext={valueText}
          className="block h-4 w-4 rounded-full border-2 border-emerald-100/90 bg-emerald-300 shadow-[0_0_10px_rgba(52,211,153,0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 focus-visible:ring-offset-2 focus-visible:ring-offset-black"
        />
      </Slider.Root>
      <div className="mt-0.5 flex justify-between font-mono text-[8px] text-white/50">
        <span>{showKeys && <kbd>−</kbd>} Calm</span>
        <span>Punchy {showKeys && <kbd>+</kbd>}</span>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-white/10 pt-1.5 font-mono text-[9px]">
        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              aria-pressed={autoBalanceEnabled}
              onClick={() => settingsStore.set({ autoBalanceEnabled: !autoBalanceEnabled })}
              className={`rounded border px-1.5 py-0.5 transition-colors ${autoBalanceEnabled ? "border-emerald-300/40 bg-emerald-300/10 text-emerald-200" : "border-white/15 text-white/60 hover:bg-white/10"}`}
            >
              Auto balance
            </button>
          </Tooltip.Trigger>
          <ShortcutTooltipContent>
            <div className="space-y-1 normal-case tracking-normal text-[10px] leading-relaxed">
              <p className="font-semibold text-emerald-200">
                Auto balance · {autoBalanceEnabled ? balance.status : "Off"}
              </p>
              <p>
                Gradually adjusts brightness when the scene stays too dark or bright, and boosts
                visual response when movement stays low.
              </p>
              <p>
                Your Response slider remains the baseline. Audio volume and beat detection stay
                unchanged.
              </p>
              <p>
                Pauses in Performance Mode and VR. Sampling slows or pauses if it becomes costly.
              </p>
              {autoBalanceEnabled && (
                <p className="text-emerald-200/80">
                  Brightness {balance.exposure.toFixed(2)}× · response correction{" "}
                  {balance.response.toFixed(2)}×
                </p>
              )}
            </div>
          </ShortcutTooltipContent>
        </Tooltip.Root>
        <span
          className="max-w-[100px] text-right text-[8px] normal-case tracking-normal text-white/50"
          title={`Brightness ${balance.exposure.toFixed(2)}× · response correction ${balance.response.toFixed(2)}× · sampling ${balance.sampleMs.toFixed(2)} ms`}
        >
          {autoBalanceEnabled ? balance.status : "Off"}
        </span>
      </div>
      <span id={descriptionId} className="sr-only">
        Visual sensitivity from one quarter to four times. Does not change audio volume or beat
        detection. Centre is normal response. Press minus for calmer or plus for punchier visuals.
      </span>
    </div>
  );
}
