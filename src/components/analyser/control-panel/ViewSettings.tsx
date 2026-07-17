import type { Settings } from "../store";
import { WIKICHROMA_ACTOR_PACKS } from "../store";
import { CLASSIC_PEAK_SWATCHES } from "../theme";
import { Bn, Label, Row, S, Sw, ToggleRow } from "./primitives";

/**
 * Per-view settings rendered inside the "<view> settings" disclosure. Each view
 * contributes its own cluster of sliders / toggles; only the active view's
 * block renders. Extracted from ControlPanel to keep that file focused on
 * layout and orchestration.
 */
export function ViewSettings({ s, set }: { s: Settings; set: (patch: Partial<Settings>) => void }) {
  return (
    <div className="space-y-3 border-t border-white/10 p-3">
      {s.view === "combo" && (
        <>
          <S
            label="Auto-orbit speed (when mouse camera off)"
            value={s.orbitSpeed}
            min={0}
            max={1}
            step={0.02}
            onChange={(v) => set({ orbitSpeed: v })}
          />
          <S
            label="Sphere size"
            value={s.comboSphereSize}
            min={0.2}
            max={3}
            step={0.05}
            onChange={(v) => set({ comboSphereSize: v })}
          />
          <S
            label="Sphere bass punch"
            value={s.comboSphereBassPunch}
            min={0}
            max={1.5}
            step={0.05}
            onChange={(v) => set({ comboSphereBassPunch: v })}
          />
          <S
            label="Sphere spin speed"
            value={s.comboSphereSpinSpeed}
            min={-1.5}
            max={1.5}
            step={0.05}
            onChange={(v) => set({ comboSphereSpinSpeed: v })}
          />
          <S
            label="Sphere displacement"
            value={s.sphereDisplacement}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => set({ sphereDisplacement: v })}
          />
          <S
            label="Bar ring radius"
            value={s.comboBarRadius}
            min={2}
            max={10}
            step={0.1}
            onChange={(v) => set({ comboBarRadius: v })}
          />
          <S
            label="Bar height"
            value={s.comboBarHeightScale}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => set({ comboBarHeightScale: v })}
          />
          <S
            label="Bar count"
            value={s.barCount}
            min={32}
            max={256}
            step={8}
            onChange={(v) => set({ barCount: Math.round(v) })}
          />
          <S
            label="Particle size"
            value={s.comboParticleSize}
            min={0.2}
            max={4}
            step={0.05}
            onChange={(v) => set({ comboParticleSize: v })}
          />
          <S
            label="Particle count"
            value={s.particleCount}
            min={500}
            max={15000}
            step={500}
            onChange={(v) => set({ particleCount: Math.round(v) })}
          />
          <div className="flex items-center justify-between pt-1">
            <Label className="text-[11px]">Level meter colours (R/Y/G)</Label>
            <Sw checked={s.comboLevelMeter} onCheckedChange={(v) => set({ comboLevelMeter: v })} />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Wireframe</Label>
            <Sw checked={s.comboWireframe} onCheckedChange={(v) => set({ comboWireframe: v })} />
          </div>
        </>
      )}
      {s.view === "classic" && (
        <>
          <ToggleRow
            label="Spin classic view"
            enabled={s.classicSpin}
            onToggle={(v) => set({ classicSpin: v })}
          >
            <S
              label="Spin speed"
              value={s.classicSpinSpeed}
              min={-2}
              max={2}
              step={0.05}
              onChange={(v) => set({ classicSpinSpeed: v })}
            />
          </ToggleRow>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Color bands (R/Y/G)</Label>
            <Sw
              checked={s.classicColorBands}
              onCheckedChange={(v) => set({ classicColorBands: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Blocky LED cells</Label>
            <Sw checked={s.classicBlocky} onCheckedChange={(v) => set({ classicBlocky: v })} />
          </div>
          {s.classicBlocky && (
            <S
              label="Segments per bar"
              value={s.classicSegments}
              min={4}
              max={40}
              step={1}
              onChange={(v) => set({ classicSegments: Math.round(v) })}
            />
          )}
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Background grid</Label>
            <Sw checked={s.classicGrid} onCheckedChange={(v) => set({ classicGrid: v })} />
          </div>
          {s.classicGrid && (
            <S
              label="Grid opacity"
              value={s.classicGridOpacity}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => set({ classicGridOpacity: v })}
            />
          )}
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Frequency labels in 2D fit</Label>
            <Sw
              checked={s.classicShowFreqLabels}
              onCheckedChange={(v) => set({ classicShowFreqLabels: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Wireframe</Label>
            <Sw
              checked={s.classicWireframe}
              onCheckedChange={(v) => set({ classicWireframe: v })}
            />
          </div>
          <S
            label="Peak hold (sec)"
            value={s.classicPeakHold}
            min={0}
            max={5}
            step={0.1}
            onChange={(v) => set({ classicPeakHold: v })}
          />
          <S
            label="Peak decay (units/sec)"
            value={s.classicPeakDecay}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ classicPeakDecay: v })}
          />

          <Row label="Peak style">
            <div className="grid grid-cols-4 gap-1.5">
              {(["bar", "thin", "glow", "none"] as const).map((style) => (
                <Bn
                  key={style}
                  active={s.classicPeakStyle === style}
                  onClick={() => set({ classicPeakStyle: style })}
                >
                  {style}
                </Bn>
              ))}
            </div>
          </Row>
          <Row label="Peak color">
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={s.classicPeakColor}
                onChange={(e) => set({ classicPeakColor: e.target.value })}
                className="h-8 w-10 cursor-pointer rounded border border-white/15 bg-transparent"
              />
              <div className="flex flex-wrap gap-1">
                {CLASSIC_PEAK_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => set({ classicPeakColor: c })}
                    className={`h-6 w-6 rounded border transition ${s.classicPeakColor.toLowerCase() === c ? "border-white scale-110" : "border-white/20 hover:border-white/40"}`}
                    style={{
                      background: c,
                      boxShadow:
                        s.classicPeakColor.toLowerCase() === c ? `0 0 10px ${c}aa` : undefined,
                    }}
                    aria-label={c}
                  />
                ))}
              </div>
            </div>
          </Row>
        </>
      )}
      {s.view === "ripple" && (
        <>
          <S
            label="Auto-orbit speed (when mouse camera off)"
            value={s.orbitSpeed}
            min={0}
            max={1}
            step={0.02}
            onChange={(v) => set({ orbitSpeed: v })}
          />
          <S
            label="Ring count"
            value={s.rippleRingCount}
            min={4}
            max={120}
            step={1}
            onChange={(v) => set({ rippleRingCount: Math.round(v) })}
          />
          <S
            label="Side-by-side ripples (freq. bands)"
            value={s.rippleColumns}
            min={1}
            max={50}
            step={1}
            onChange={(v) => set({ rippleColumns: Math.round(v) })}
          />
          <S
            label="Max radius"
            value={s.rippleMaxRadius}
            min={2}
            max={14}
            step={0.1}
            onChange={(v) => set({ rippleMaxRadius: v })}
          />
          <S
            label="Wave speed"
            value={s.rippleSpeed}
            min={0}
            max={4}
            step={0.05}
            onChange={(v) => set({ rippleSpeed: v })}
          />
          <S
            label="Amplitude"
            value={s.rippleAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ rippleAmplitude: v })}
          />
          <S
            label="Wave cycles"
            value={s.rippleWaveCycles}
            min={0.2}
            max={6}
            step={0.1}
            onChange={(v) => set({ rippleWaveCycles: v })}
          />
          <S
            label="Ring thickness"
            value={s.rippleThickness}
            min={0.2}
            max={3}
            step={0.05}
            onChange={(v) => set({ rippleThickness: v })}
          />
          <S
            label="Rotation speed"
            value={s.rippleRotationSpeed}
            min={-1}
            max={1}
            step={0.02}
            onChange={(v) => set({ rippleRotationSpeed: v })}
          />
          <S
            label="Opacity"
            value={s.rippleOpacity}
            min={0.1}
            max={1}
            step={0.02}
            onChange={(v) => set({ rippleOpacity: v })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Wireframe</Label>
            <Sw checked={s.rippleWireframe} onCheckedChange={(v) => set({ rippleWireframe: v })} />
          </div>
        </>
      )}
      {s.view === "datastream" && (
        <>
          <S
            label="Amplitude"
            value={s.datastreamAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ datastreamAmplitude: v })}
          />
          <S
            label="Particle count"
            value={s.datastreamItemCount}
            min={500}
            max={30000}
            step={500}
            onChange={(v) => set({ datastreamItemCount: Math.round(v) })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.datastreamUsePalette}
              onCheckedChange={(v) => set({ datastreamUsePalette: v })}
            />
          </div>
        </>
      )}
      {s.view === "nebula" && (
        <>
          <S
            label="Amplitude"
            value={s.nebulaAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ nebulaAmplitude: v })}
          />
          <S
            label="Detail"
            value={s.nebulaDetail}
            min={24}
            max={220}
            step={4}
            onChange={(v) => set({ nebulaDetail: Math.round(v) })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.nebulaUsePalette}
              onCheckedChange={(v) => set({ nebulaUsePalette: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Wireframe</Label>
            <Sw checked={s.nebulaWireframe} onCheckedChange={(v) => set({ nebulaWireframe: v })} />
          </div>
        </>
      )}
      {s.view === "monolith" && (
        <>
          <S
            label="Amplitude"
            value={s.monolithAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ monolithAmplitude: v })}
          />
          <S
            label="Brightness"
            value={s.monolithBrightness}
            min={0.2}
            max={3}
            step={0.05}
            onChange={(v) => set({ monolithBrightness: v })}
          />
          <S
            label="Grid size (NxN squares)"
            value={s.monolithGridSize}
            min={2}
            max={40}
            step={1}
            onChange={(v) => set({ monolithGridSize: Math.round(v) })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.monolithUsePalette}
              onCheckedChange={(v) => set({ monolithUsePalette: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Wireframe</Label>
            <Sw
              checked={s.monolithWireframe}
              onCheckedChange={(v) => set({ monolithWireframe: v })}
            />
          </div>
        </>
      )}
      {s.view === "mandala" && (
        <>
          <S
            label="Amplitude"
            value={s.mandalaAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ mandalaAmplitude: v })}
          />
          <S
            label="Line count"
            value={s.mandalaLineCount}
            min={2}
            max={48}
            step={1}
            onChange={(v) => set({ mandalaLineCount: Math.round(v) })}
          />
          <S
            label="Line width"
            value={s.mandalaLineWidth}
            min={1}
            max={8}
            step={0.5}
            onChange={(v) => set({ mandalaLineWidth: v })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.mandalaUsePalette}
              onCheckedChange={(v) => set({ mandalaUsePalette: v })}
            />
          </div>
        </>
      )}
      {s.view === "terrain" && (
        <>
          <S
            label="Amplitude"
            value={s.terrainAmplitude}
            min={0.05}
            max={4}
            step={0.05}
            onChange={(v) => set({ terrainAmplitude: v })}
          />
          <S
            label="Columns"
            value={s.terrainColumns}
            min={16}
            max={256}
            step={8}
            onChange={(v) => set({ terrainColumns: Math.round(v) })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.terrainUsePalette}
              onCheckedChange={(v) => set({ terrainUsePalette: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Wireframe</Label>
            <Sw
              checked={s.terrainWireframe}
              onCheckedChange={(v) => set({ terrainWireframe: v })}
            />
          </div>
        </>
      )}
      {s.view === "obsidian" && (
        <>
          <S
            label="Amplitude"
            value={s.obsidianAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ obsidianAmplitude: v })}
          />
          <Row label="Shard detail">
            <div className="flex gap-1.5">
              {([0, 1, 2, 3] as const).map((d) => (
                <Bn
                  key={d}
                  active={s.obsidianShardDetail === d}
                  className="flex-1"
                  onClick={() => set({ obsidianShardDetail: d })}
                >
                  {d === 0 ? "Low" : d === 1 ? "Med" : d === 2 ? "High" : "Ultra"}
                </Bn>
              ))}
            </div>
          </Row>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.obsidianUsePalette}
              onCheckedChange={(v) => set({ obsidianUsePalette: v })}
            />
          </div>
        </>
      )}
      {s.view === "torus" && (
        <>
          <S
            label="Amplitude"
            value={s.torusAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ torusAmplitude: v })}
          />
          <S
            label="Orbit speed"
            value={s.torusSpeed}
            min={0.1}
            max={4}
            step={0.1}
            onChange={(v) => set({ torusSpeed: v })}
          />
          <S
            label="Torus count"
            value={s.torusCount}
            min={1}
            max={5}
            step={1}
            onChange={(v) => set({ torusCount: Math.round(v) })}
          />
          <S
            label="Torus spacing"
            value={s.torusSpacing}
            min={6}
            max={24}
            step={0.2}
            onChange={(v) => set({ torusSpacing: v })}
          />
          <S
            label="Torus size"
            value={s.torusSize}
            min={0.5}
            max={1.8}
            step={0.05}
            onChange={(v) => set({ torusSize: v })}
          />
          <S
            label="Particle size"
            value={s.torusParticleSize}
            min={0.01}
            max={0.16}
            step={0.005}
            onChange={(v) => set({ torusParticleSize: v })}
          />
          <S
            label="Particle count"
            value={s.torusParticleCount}
            min={200}
            max={20000}
            step={200}
            onChange={(v) => set({ torusParticleCount: Math.round(v) })}
          />
          <Row label="Color mode">
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["shared", "Shared"],
                  ["individual", "Individual"],
                ] as const
              ).map(([mode, label]) => (
                <Bn
                  key={mode}
                  active={s.torusColorMode === mode}
                  className="justify-start"
                  onClick={() => set({ torusColorMode: mode })}
                >
                  {label}
                </Bn>
              ))}
            </div>
          </Row>
          <Row label="Rotation mode">
            <div className="grid grid-cols-2 gap-1.5">
              {(
                [
                  ["flat", "Flat"],
                  ["odd-upright", "Odd up"],
                  ["alternating-x", "Alt X"],
                  ["alternating-z", "Alt Z"],
                  ["fan", "Fan"],
                ] as const
              ).map(([mode, label]) => (
                <Bn
                  key={mode}
                  active={s.torusRotationMode === mode}
                  className="justify-start"
                  onClick={() => set({ torusRotationMode: mode })}
                >
                  {label}
                </Bn>
              ))}
            </div>
          </Row>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw checked={s.torusUsePalette} onCheckedChange={(v) => set({ torusUsePalette: v })} />
          </div>
        </>
      )}
      {s.view === "soundwall" && (
        <>
          <S
            label="Amplitude"
            value={s.soundwallAmplitude}
            min={0.05}
            max={3}
            step={0.05}
            onChange={(v) => set({ soundwallAmplitude: v })}
          />
          <S
            label="Columns per side"
            value={s.soundwallColumns}
            min={4}
            max={40}
            step={1}
            onChange={(v) => set({ soundwallColumns: Math.round(v) })}
          />
          <S
            label="History rows (depth)"
            value={s.soundwallRows}
            min={2}
            max={24}
            step={1}
            onChange={(v) => set({ soundwallRows: Math.round(v) })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.soundwallUsePalette}
              onCheckedChange={(v) => set({ soundwallUsePalette: v })}
            />
          </div>
        </>
      )}
      {s.view === "geometrynebula" && (
        <>
          <S
            label="Amplitude"
            value={s.geometrynebulaAmplitude}
            min={0.05}
            max={5}
            step={0.05}
            onChange={(v) => set({ geometrynebulaAmplitude: v })}
          />
          <S
            label="Shape count"
            value={s.geometrynebulaCount}
            min={6}
            max={120}
            step={6}
            onChange={(v) => set({ geometrynebulaCount: Math.round(v) })}
          />
          <S
            label="Shape spread"
            value={s.geometrynebulaSpread}
            min={0.8}
            max={3}
            step={0.05}
            onChange={(v) => set({ geometrynebulaSpread: v })}
          />
          <S
            label="Orbit speed"
            value={s.geometrynebulaOrbitSpeed}
            min={0.1}
            max={2.5}
            step={0.05}
            onChange={(v) => set({ geometrynebulaOrbitSpeed: v })}
          />
          <S
            label="Spin speed"
            value={s.geometrynebulaSpinSpeed}
            min={0.1}
            max={4}
            step={0.05}
            onChange={(v) => set({ geometrynebulaSpinSpeed: v })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.geometrynebulaUsePalette}
              onCheckedChange={(v) => set({ geometrynebulaUsePalette: v })}
            />
          </div>
        </>
      )}
      {s.view === "reztube" && (
        <>
          <S
            label="Amplitude"
            value={s.reztubeAmplitude}
            min={0.1}
            max={4}
            step={0.05}
            onChange={(v) => set({ reztubeAmplitude: v })}
          />
          <S
            label="Fly speed"
            value={s.reztubeSpeed}
            min={0.1}
            max={6}
            step={0.1}
            onChange={(v) => set({ reztubeSpeed: v })}
          />
          <S
            label="Twist"
            value={s.reztubeTwist}
            min={0}
            max={4}
            step={0.05}
            onChange={(v) => set({ reztubeTwist: v })}
          />
          <S
            label="Tube radius"
            value={s.reztubeRadius}
            min={2}
            max={10}
            step={0.1}
            onChange={(v) => set({ reztubeRadius: v })}
          />
          <S
            label="Sides"
            value={s.reztubeSegments}
            min={3}
            max={12}
            step={1}
            onChange={(v) => set({ reztubeSegments: Math.round(v) })}
          />
          <S
            label="Line width"
            value={s.reztubeLineWidth}
            min={0.5}
            max={6}
            step={0.5}
            onChange={(v) => set({ reztubeLineWidth: v })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.reztubeUsePalette}
              onCheckedChange={(v) => set({ reztubeUsePalette: v })}
            />
          </div>
        </>
      )}
      {s.view === "assetflow" && (
        <>
          <S
            label="Amplitude"
            value={s.assetflowAmplitude}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => set({ assetflowAmplitude: v })}
          />
          <S
            label="Model scale"
            value={s.assetflowModelScale}
            min={0.4}
            max={2.2}
            step={0.05}
            onChange={(v) => set({ assetflowModelScale: v })}
          />
          <S
            label="2D background amount"
            value={s.assetflowSpriteAmount}
            min={0.2}
            max={2.5}
            step={0.05}
            onChange={(v) => set({ assetflowSpriteAmount: v })}
          />
          <S
            label="Movement intensity"
            value={s.assetflowMovement}
            min={0.35}
            max={1.8}
            step={0.05}
            onChange={(v) => set({ assetflowMovement: v })}
          />
          <S
            label="2D background drift"
            value={s.assetflowBackgroundDrift}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => set({ assetflowBackgroundDrift: v })}
          />
          <S
            label="Model count"
            value={s.assetflowModelCount}
            min={1}
            max={24}
            step={1}
            onChange={(v) => set({ assetflowModelCount: Math.round(v) })}
          />
          <S
            label="Model spread"
            value={s.assetflowSpread}
            min={2}
            max={12}
            step={0.1}
            onChange={(v) => set({ assetflowSpread: v })}
          />
          <S
            label="Model spin"
            value={s.assetflowSpin}
            min={0}
            max={3}
            step={0.05}
            onChange={(v) => set({ assetflowSpin: v })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.assetflowUsePalette}
              onCheckedChange={(v) => set({ assetflowUsePalette: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Include geometric shapes</Label>
            <Sw
              checked={s.assetflowIncludeShapes}
              onCheckedChange={(v) => set({ assetflowIncludeShapes: v })}
            />
          </div>
          <div className="rounded-md border border-white/10 bg-white/[0.02] px-3 py-2">
            <Label className="text-[11px]">Asset licenses</Label>
            <p className="mt-1 text-[10px] leading-relaxed text-white/60">
              Asset-Flow uses Khronos glTF Sample Assets. Most runtime models are CC0 1.0; Fox
              includes CC BY 4.0 contributions and requires attribution.
            </p>
            <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.16em] text-white/35">
              Full ledger: docs/THIRD_PARTY_ASSETS.md
            </p>
          </div>
        </>
      )}
      {s.view === "wikichroma" && (
        <>
          <S
            label="Amplitude"
            value={s.wikichromaAmplitude}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => set({ wikichromaAmplitude: v })}
          />
          <S
            label="Motion speed"
            value={s.wikichromaMotionSpeed}
            min={0.2}
            max={3}
            step={0.05}
            onChange={(v) => set({ wikichromaMotionSpeed: v })}
          />
          <Row label="Motion mode">
            <div className="grid grid-cols-3 gap-1.5">
              {(["orbit", "cogs", "runner"] as const).map((mode) => (
                <Bn
                  key={mode}
                  active={s.wikichromaMotionMode === mode}
                  onClick={() => set({ wikichromaMotionMode: mode })}
                >
                  {mode}
                </Bn>
              ))}
            </div>
          </Row>
          <S
            label="Actor flow strength"
            value={s.wikichromaFlowStrength}
            min={0}
            max={2}
            step={0.05}
            onChange={(v) => set({ wikichromaFlowStrength: v })}
          />
          <Row label="Beats per loop">
            <div className="grid grid-cols-3 gap-1.5">
              {([1, 2, 4] as const).map((beats) => (
                <Bn
                  key={beats}
                  active={s.wikichromaBeatsPerLoop === beats}
                  onClick={() => set({ wikichromaBeatsPerLoop: beats })}
                >
                  {beats}
                </Bn>
              ))}
            </div>
          </Row>
          <Row label="Actor packs (multi-select)">
            <div className="grid grid-cols-3 gap-1.5">
              {WIKICHROMA_ACTOR_PACKS.map((pack) => {
                const selected = s.wikichromaActorPacks.includes(pack);
                return (
                  <Bn
                    key={pack}
                    active={selected}
                    onClick={() => {
                      // Keep at least one pack selected.
                      if (selected && s.wikichromaActorPacks.length === 1) return;
                      const next = selected
                        ? s.wikichromaActorPacks.filter((p) => p !== pack)
                        : [...s.wikichromaActorPacks, pack];
                      set({ wikichromaActorPacks: next });
                    }}
                  >
                    {pack}
                  </Bn>
                );
              })}
            </div>
          </Row>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.wikichromaUsePalette}
              onCheckedChange={(v) => set({ wikichromaUsePalette: v })}
            />
          </div>
        </>
      )}
      {s.view === "stagelights" && (
        <>
          <S
            label="Amplitude"
            value={s.stagelightsAmplitude}
            min={0.1}
            max={3}
            step={0.05}
            onChange={(v) => set({ stagelightsAmplitude: v })}
          />
          <S
            label="Sweep speed"
            value={s.stagelightsSweepSpeed}
            min={0.2}
            max={3}
            step={0.05}
            onChange={(v) => set({ stagelightsSweepSpeed: v })}
          />
          <S
            label="Fixture count"
            value={s.stagelightsFixtureCount}
            min={3}
            max={7}
            step={2}
            onChange={(v) => set({ stagelightsFixtureCount: Math.round(v) })}
          />
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Use selected palette</Label>
            <Sw
              checked={s.stagelightsUsePalette}
              onCheckedChange={(v) => set({ stagelightsUsePalette: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-[11px]">Lasers</Label>
            <Sw
              checked={s.stagelightsLasers}
              onCheckedChange={(v) => set({ stagelightsLasers: v })}
            />
          </div>
        </>
      )}
    </div>
  );
}
