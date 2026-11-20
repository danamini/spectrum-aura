import type { Settings } from "../store";
import { WIKICHROMA_ACTOR_PACKS } from "../store";
import { CLASSIC_PEAK_SWATCHES } from "../theme";
import { Bn, Label, Row, S, Sw, ToggleRow, ViewControls } from "./primitives";

/**
 * Per-view settings rendered inside the "<view> settings" disclosure. Each view
 * contributes its own cluster of sliders / toggles; only the active view's
 * block renders. Extracted from ControlPanel to keep that file focused on
 * layout and orchestration.
 */
/** Views whose controls are not listed with the most useful first. */
const HEADLINE_FIRST: Partial<Record<Settings["view"], readonly string[]>> = {
  combo: ["Bar height", "Sphere size", "Sphere bass punch", "Bar count"],
  ripple: ["Amplitude", "Wave speed", "Ring count", "Max radius"],
};

export function ViewSettings({ s, set }: { s: Settings; set: (patch: Partial<Settings>) => void }) {
  return (
    <div className="space-y-3 border-t border-white/10 p-3">
      {/* Keyed by view so "More" starts closed again on each view. */}
      <ViewControls key={s.view} first={HEADLINE_FIRST[s.view]}>
        {s.view === "combo" && (
          <>
            <S
              label="Auto-orbit speed (when mouse camera off)"
              value={s.orbitSpeed}
              min={0}
              max={1}
              step={0.02}
              onChange={(v) => set({ orbitSpeed: v })}
              k="orbitSpeed"
            />
            <S
              label="Sphere size"
              value={s.comboSphereSize}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(v) => set({ comboSphereSize: v })}
              k="comboSphereSize"
            />
            <S
              label="Sphere bass punch"
              value={s.comboSphereBassPunch}
              min={0}
              max={1.5}
              step={0.05}
              onChange={(v) => set({ comboSphereBassPunch: v })}
              k="comboSphereBassPunch"
            />
            <S
              label="Sphere spin speed"
              value={s.comboSphereSpinSpeed}
              min={-1.5}
              max={1.5}
              step={0.05}
              onChange={(v) => set({ comboSphereSpinSpeed: v })}
              k="comboSphereSpinSpeed"
            />
            <S
              label="Sphere displacement"
              value={s.sphereDisplacement}
              min={0}
              max={2}
              step={0.05}
              onChange={(v) => set({ sphereDisplacement: v })}
              k="sphereDisplacement"
            />
            <S
              label="Bar ring radius"
              value={s.comboBarRadius}
              min={2}
              max={10}
              step={0.1}
              onChange={(v) => set({ comboBarRadius: v })}
              k="comboBarRadius"
            />
            <S
              label="Bar height"
              value={s.comboBarHeightScale}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ comboBarHeightScale: v })}
              k="comboBarHeightScale"
            />
            <S
              label="Bar count"
              value={s.barCount}
              min={32}
              max={256}
              step={8}
              onChange={(v) => set({ barCount: Math.round(v) })}
              k="barCount"
            />
            <S
              label="Particle size"
              value={s.comboParticleSize}
              min={0.2}
              max={4}
              step={0.05}
              onChange={(v) => set({ comboParticleSize: v })}
              k="comboParticleSize"
            />
            <S
              label="Particle count"
              value={s.particleCount}
              min={500}
              max={15000}
              step={500}
              onChange={(v) => set({ particleCount: Math.round(v) })}
              k="particleCount"
            />
            <div className="flex items-center justify-between pt-1">
              <Label className="text-[11px]">Level meter colours (R/Y/G)</Label>
              <Sw
                checked={s.comboLevelMeter}
                onCheckedChange={(v) => set({ comboLevelMeter: v })}
                k="comboLevelMeter"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Wireframe</Label>
              <Sw
                checked={s.comboWireframe}
                onCheckedChange={(v) => set({ comboWireframe: v })}
                k="comboWireframe"
              />
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
                k="classicSpinSpeed"
              />
            </ToggleRow>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Color bands (R/Y/G)</Label>
              <Sw
                checked={s.classicColorBands}
                onCheckedChange={(v) => set({ classicColorBands: v })}
                k="classicColorBands"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Blocky LED cells</Label>
              <Sw
                checked={s.classicBlocky}
                onCheckedChange={(v) => set({ classicBlocky: v })}
                k="classicBlocky"
              />
            </div>
            {s.classicBlocky && (
              <S
                label="Segments per bar"
                value={s.classicSegments}
                min={4}
                max={40}
                step={1}
                onChange={(v) => set({ classicSegments: Math.round(v) })}
                k="classicSegments"
              />
            )}
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Background grid</Label>
              <Sw
                checked={s.classicGrid}
                onCheckedChange={(v) => set({ classicGrid: v })}
                k="classicGrid"
              />
            </div>
            {s.classicGrid && (
              <S
                label="Grid opacity"
                value={s.classicGridOpacity}
                min={0}
                max={1}
                step={0.02}
                onChange={(v) => set({ classicGridOpacity: v })}
                k="classicGridOpacity"
              />
            )}
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Frequency labels in 2D fit</Label>
              <Sw
                checked={s.classicShowFreqLabels}
                onCheckedChange={(v) => set({ classicShowFreqLabels: v })}
                k="classicShowFreqLabels"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Wireframe</Label>
              <Sw
                checked={s.classicWireframe}
                onCheckedChange={(v) => set({ classicWireframe: v })}
                k="classicWireframe"
              />
            </div>
            <S
              label="Peak hold (sec)"
              value={s.classicPeakHold}
              min={0}
              max={5}
              step={0.1}
              onChange={(v) => set({ classicPeakHold: v })}
              k="classicPeakHold"
            />
            <S
              label="Peak decay (units/sec)"
              value={s.classicPeakDecay}
              min={0.05}
              max={3}
              step={0.05}
              onChange={(v) => set({ classicPeakDecay: v })}
              k="classicPeakDecay"
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
              k="orbitSpeed"
            />
            <S
              label="Ring count"
              value={s.rippleRingCount}
              min={4}
              max={120}
              step={1}
              onChange={(v) => set({ rippleRingCount: Math.round(v) })}
              k="rippleRingCount"
            />
            <S
              label="Side-by-side ripples (freq. bands)"
              value={s.rippleColumns}
              min={1}
              max={50}
              step={1}
              onChange={(v) => set({ rippleColumns: Math.round(v) })}
              k="rippleColumns"
            />
            <S
              label="Max radius"
              value={s.rippleMaxRadius}
              min={2}
              max={14}
              step={0.1}
              onChange={(v) => set({ rippleMaxRadius: v })}
              k="rippleMaxRadius"
            />
            <S
              label="Wave speed"
              value={s.rippleSpeed}
              min={0}
              max={4}
              step={0.05}
              onChange={(v) => set({ rippleSpeed: v })}
              k="rippleSpeed"
            />
            <S
              label="Amplitude"
              value={s.rippleAmplitude}
              min={0.05}
              max={3}
              step={0.05}
              onChange={(v) => set({ rippleAmplitude: v })}
              k="rippleAmplitude"
            />
            <S
              label="Wave cycles"
              value={s.rippleWaveCycles}
              min={0.2}
              max={6}
              step={0.1}
              onChange={(v) => set({ rippleWaveCycles: v })}
              k="rippleWaveCycles"
            />
            <S
              label="Ring thickness"
              value={s.rippleThickness}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(v) => set({ rippleThickness: v })}
              k="rippleThickness"
            />
            <S
              label="Rotation speed"
              value={s.rippleRotationSpeed}
              min={-1}
              max={1}
              step={0.02}
              onChange={(v) => set({ rippleRotationSpeed: v })}
              k="rippleRotationSpeed"
            />
            <S
              label="Opacity"
              value={s.rippleOpacity}
              min={0.1}
              max={1}
              step={0.02}
              onChange={(v) => set({ rippleOpacity: v })}
              k="rippleOpacity"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Wireframe</Label>
              <Sw
                checked={s.rippleWireframe}
                onCheckedChange={(v) => set({ rippleWireframe: v })}
                k="rippleWireframe"
              />
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
              k="datastreamAmplitude"
            />
            <S
              label="Particle count"
              value={s.datastreamItemCount}
              min={500}
              max={30000}
              step={500}
              onChange={(v) => set({ datastreamItemCount: Math.round(v) })}
              k="datastreamItemCount"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.datastreamUsePalette}
                onCheckedChange={(v) => set({ datastreamUsePalette: v })}
                k="datastreamUsePalette"
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
              k="nebulaAmplitude"
            />
            <S
              label="Detail"
              value={s.nebulaDetail}
              min={24}
              max={220}
              step={4}
              onChange={(v) => set({ nebulaDetail: Math.round(v) })}
              k="nebulaDetail"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.nebulaUsePalette}
                onCheckedChange={(v) => set({ nebulaUsePalette: v })}
                k="nebulaUsePalette"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Wireframe</Label>
              <Sw
                checked={s.nebulaWireframe}
                onCheckedChange={(v) => set({ nebulaWireframe: v })}
                k="nebulaWireframe"
              />
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
              k="monolithAmplitude"
            />
            <S
              label="Brightness"
              value={s.monolithBrightness}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(v) => set({ monolithBrightness: v })}
              k="monolithBrightness"
            />
            <S
              label="Grid size (NxN squares)"
              value={s.monolithGridSize}
              min={2}
              max={40}
              step={1}
              onChange={(v) => set({ monolithGridSize: Math.round(v) })}
              k="monolithGridSize"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.monolithUsePalette}
                onCheckedChange={(v) => set({ monolithUsePalette: v })}
                k="monolithUsePalette"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Wireframe</Label>
              <Sw
                checked={s.monolithWireframe}
                onCheckedChange={(v) => set({ monolithWireframe: v })}
                k="monolithWireframe"
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
              k="mandalaAmplitude"
            />
            <S
              label="Line count"
              value={s.mandalaLineCount}
              min={2}
              max={48}
              step={1}
              onChange={(v) => set({ mandalaLineCount: Math.round(v) })}
              k="mandalaLineCount"
            />
            <S
              label="Line width"
              value={s.mandalaLineWidth}
              min={1}
              max={8}
              step={0.5}
              onChange={(v) => set({ mandalaLineWidth: v })}
              k="mandalaLineWidth"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.mandalaUsePalette}
                onCheckedChange={(v) => set({ mandalaUsePalette: v })}
                k="mandalaUsePalette"
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
              k="terrainAmplitude"
            />
            <S
              label="Columns"
              value={s.terrainColumns}
              min={16}
              max={256}
              step={8}
              onChange={(v) => set({ terrainColumns: Math.round(v) })}
              k="terrainColumns"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.terrainUsePalette}
                onCheckedChange={(v) => set({ terrainUsePalette: v })}
                k="terrainUsePalette"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Wireframe</Label>
              <Sw
                checked={s.terrainWireframe}
                onCheckedChange={(v) => set({ terrainWireframe: v })}
                k="terrainWireframe"
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
              k="obsidianAmplitude"
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
                k="obsidianUsePalette"
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
              k="torusAmplitude"
            />
            <S
              label="Orbit speed"
              value={s.torusSpeed}
              min={0.1}
              max={4}
              step={0.1}
              onChange={(v) => set({ torusSpeed: v })}
              k="torusSpeed"
            />
            <S
              label="Torus count"
              value={s.torusCount}
              min={1}
              max={5}
              step={1}
              onChange={(v) => set({ torusCount: Math.round(v) })}
              k="torusCount"
            />
            <S
              label="Torus spacing"
              value={s.torusSpacing}
              min={6}
              max={24}
              step={0.2}
              onChange={(v) => set({ torusSpacing: v })}
              k="torusSpacing"
            />
            <S
              label="Torus size"
              value={s.torusSize}
              min={0.5}
              max={1.8}
              step={0.05}
              onChange={(v) => set({ torusSize: v })}
              k="torusSize"
            />
            <S
              label="Particle size"
              value={s.torusParticleSize}
              min={0.01}
              max={0.16}
              step={0.005}
              onChange={(v) => set({ torusParticleSize: v })}
              k="torusParticleSize"
            />
            <S
              label="Particle count"
              value={s.torusParticleCount}
              min={200}
              max={20000}
              step={200}
              onChange={(v) => set({ torusParticleCount: Math.round(v) })}
              k="torusParticleCount"
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
              <Sw
                checked={s.torusUsePalette}
                onCheckedChange={(v) => set({ torusUsePalette: v })}
                k="torusUsePalette"
              />
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
              k="soundwallAmplitude"
            />
            <S
              label="Columns per side"
              value={s.soundwallColumns}
              min={4}
              max={40}
              step={1}
              onChange={(v) => set({ soundwallColumns: Math.round(v) })}
              k="soundwallColumns"
            />
            <S
              label="History rows (depth)"
              value={s.soundwallRows}
              min={2}
              max={24}
              step={1}
              onChange={(v) => set({ soundwallRows: Math.round(v) })}
              k="soundwallRows"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.soundwallUsePalette}
                onCheckedChange={(v) => set({ soundwallUsePalette: v })}
                k="soundwallUsePalette"
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
              k="geometrynebulaAmplitude"
            />
            <S
              label="Shape count"
              value={s.geometrynebulaCount}
              min={6}
              max={120}
              step={6}
              onChange={(v) => set({ geometrynebulaCount: Math.round(v) })}
              k="geometrynebulaCount"
            />
            <S
              label="Shape spread"
              value={s.geometrynebulaSpread}
              min={0.8}
              max={3}
              step={0.05}
              onChange={(v) => set({ geometrynebulaSpread: v })}
              k="geometrynebulaSpread"
            />
            <S
              label="Orbit speed"
              value={s.geometrynebulaOrbitSpeed}
              min={0.1}
              max={2.5}
              step={0.05}
              onChange={(v) => set({ geometrynebulaOrbitSpeed: v })}
              k="geometrynebulaOrbitSpeed"
            />
            <S
              label="Spin speed"
              value={s.geometrynebulaSpinSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ geometrynebulaSpinSpeed: v })}
              k="geometrynebulaSpinSpeed"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.geometrynebulaUsePalette}
                onCheckedChange={(v) => set({ geometrynebulaUsePalette: v })}
                k="geometrynebulaUsePalette"
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
              k="reztubeAmplitude"
            />
            <S
              label="Fly speed"
              value={s.reztubeSpeed}
              min={0.1}
              max={6}
              step={0.1}
              onChange={(v) => set({ reztubeSpeed: v })}
              k="reztubeSpeed"
            />
            <S
              label="Twist"
              value={s.reztubeTwist}
              min={0}
              max={4}
              step={0.05}
              onChange={(v) => set({ reztubeTwist: v })}
              k="reztubeTwist"
            />
            <S
              label="Tube radius"
              value={s.reztubeRadius}
              min={2}
              max={10}
              step={0.1}
              onChange={(v) => set({ reztubeRadius: v })}
              k="reztubeRadius"
            />
            <S
              label="Sides"
              value={s.reztubeSegments}
              min={3}
              max={12}
              step={1}
              onChange={(v) => set({ reztubeSegments: Math.round(v) })}
              k="reztubeSegments"
            />
            <S
              label="Line width"
              value={s.reztubeLineWidth}
              min={0.5}
              max={6}
              step={0.5}
              onChange={(v) => set({ reztubeLineWidth: v })}
              k="reztubeLineWidth"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.reztubeUsePalette}
                onCheckedChange={(v) => set({ reztubeUsePalette: v })}
                k="reztubeUsePalette"
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
              k="assetflowAmplitude"
            />
            <S
              label="Model scale"
              value={s.assetflowModelScale}
              min={0.4}
              max={2.2}
              step={0.05}
              onChange={(v) => set({ assetflowModelScale: v })}
              k="assetflowModelScale"
            />
            <S
              label="2D background amount"
              value={s.assetflowSpriteAmount}
              min={0.2}
              max={2.5}
              step={0.05}
              onChange={(v) => set({ assetflowSpriteAmount: v })}
              k="assetflowSpriteAmount"
            />
            <S
              label="Movement intensity"
              value={s.assetflowMovement}
              min={0.35}
              max={1.8}
              step={0.05}
              onChange={(v) => set({ assetflowMovement: v })}
              k="assetflowMovement"
            />
            <S
              label="2D background drift"
              value={s.assetflowBackgroundDrift}
              min={0}
              max={3}
              step={0.05}
              onChange={(v) => set({ assetflowBackgroundDrift: v })}
              k="assetflowBackgroundDrift"
            />
            <S
              label="Model count"
              value={s.assetflowModelCount}
              min={1}
              max={24}
              step={1}
              onChange={(v) => set({ assetflowModelCount: Math.round(v) })}
              k="assetflowModelCount"
            />
            <S
              label="Model spread"
              value={s.assetflowSpread}
              min={2}
              max={12}
              step={0.1}
              onChange={(v) => set({ assetflowSpread: v })}
              k="assetflowSpread"
            />
            <S
              label="Model spin"
              value={s.assetflowSpin}
              min={0}
              max={3}
              step={0.05}
              onChange={(v) => set({ assetflowSpin: v })}
              k="assetflowSpin"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.assetflowUsePalette}
                onCheckedChange={(v) => set({ assetflowUsePalette: v })}
                k="assetflowUsePalette"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Include geometric shapes</Label>
              <Sw
                checked={s.assetflowIncludeShapes}
                onCheckedChange={(v) => set({ assetflowIncludeShapes: v })}
                k="assetflowIncludeShapes"
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
              k="wikichromaAmplitude"
            />
            <S
              label="Motion speed"
              value={s.wikichromaMotionSpeed}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(v) => set({ wikichromaMotionSpeed: v })}
              k="wikichromaMotionSpeed"
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
              k="wikichromaFlowStrength"
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
                k="wikichromaUsePalette"
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
              k="stagelightsAmplitude"
            />
            <S
              label="Sweep speed"
              value={s.stagelightsSweepSpeed}
              min={0.2}
              max={3}
              step={0.05}
              onChange={(v) => set({ stagelightsSweepSpeed: v })}
              k="stagelightsSweepSpeed"
            />
            <S
              label="Fixture count"
              value={s.stagelightsFixtureCount}
              min={3}
              max={7}
              step={2}
              onChange={(v) => set({ stagelightsFixtureCount: Math.round(v) })}
              k="stagelightsFixtureCount"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.stagelightsUsePalette}
                onCheckedChange={(v) => set({ stagelightsUsePalette: v })}
                k="stagelightsUsePalette"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Lasers</Label>
              <Sw
                checked={s.stagelightsLasers}
                onCheckedChange={(v) => set({ stagelightsLasers: v })}
                k="stagelightsLasers"
              />
            </div>
          </>
        )}
        {s.view === "outrun" && (
          <>
            <S
              label="Mountain height"
              value={s.outrunAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ outrunAmplitude: v })}
              k="outrunAmplitude"
            />
            <S
              label="Cruise speed"
              value={s.outrunSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ outrunSpeed: v })}
              k="outrunSpeed"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Sun</Label>
              <Sw
                checked={s.outrunSun}
                onCheckedChange={(v) => set({ outrunSun: v })}
                k="outrunSun"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.outrunUsePalette}
                onCheckedChange={(v) => set({ outrunUsePalette: v })}
                k="outrunUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "globe" && (
          <>
            <S
              label="Amplitude"
              value={s.globeAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ globeAmplitude: v })}
              k="globeAmplitude"
            />
            <S
              label="Spin speed"
              value={s.globeSpinSpeed}
              min={0}
              max={4}
              step={0.05}
              onChange={(v) => set({ globeSpinSpeed: v })}
              k="globeSpinSpeed"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Country map</Label>
              <Sw
                checked={s.globeLiveData}
                onCheckedChange={(v) => set({ globeLiveData: v })}
                k="globeLiveData"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.globeUsePalette}
                onCheckedChange={(v) => set({ globeUsePalette: v })}
                k="globeUsePalette"
              />
            </div>
            <p className="text-[10px] leading-snug text-white/45">
              The country map is Natural Earth outlines loaded from jsDelivr. Off makes no network
              requests and shows the plain globe.
            </p>
          </>
        )}
        {s.view === "spectrotunnel" && (
          <>
            <S
              label="Amplitude"
              value={s.spectrotunnelAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ spectrotunnelAmplitude: v })}
              k="spectrotunnelAmplitude"
            />
            <S
              label="Speed"
              value={s.spectrotunnelSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ spectrotunnelSpeed: v })}
              k="spectrotunnelSpeed"
            />
            <S
              label="Twist"
              value={s.spectrotunnelTwist}
              min={-4}
              max={4}
              step={0.05}
              onChange={(v) => set({ spectrotunnelTwist: v })}
              k="spectrotunnelTwist"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.spectrotunnelUsePalette}
                onCheckedChange={(v) => set({ spectrotunnelUsePalette: v })}
                k="spectrotunnelUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "fractal" && (
          <>
            <S
              label="Amplitude"
              value={s.fractalAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ fractalAmplitude: v })}
              k="fractalAmplitude"
            />
            <S
              label="Power"
              value={s.fractalPower}
              min={2}
              max={12}
              step={0.1}
              onChange={(v) => set({ fractalPower: v })}
              k="fractalPower"
            />
            <S
              label="Detail"
              value={s.fractalDetail}
              min={24}
              max={128}
              step={4}
              onChange={(v) => set({ fractalDetail: Math.round(v) })}
              k="fractalDetail"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.fractalUsePalette}
                onCheckedChange={(v) => set({ fractalUsePalette: v })}
                k="fractalUsePalette"
              />
            </div>
            <p className="text-[10px] leading-snug text-white/45">
              Detail is the per-pixel march budget — lower it if the frame rate drops. Performance
              Mode halves it.
            </p>
          </>
        )}
        {s.view === "blackhole" && (
          <>
            <S
              label="Amplitude"
              value={s.blackholeAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ blackholeAmplitude: v })}
              k="blackholeAmplitude"
            />
            <S
              label="Disk spin"
              value={s.blackholeSpin}
              min={0.05}
              max={4}
              step={0.05}
              onChange={(v) => set({ blackholeSpin: v })}
              k="blackholeSpin"
            />
            <S
              label="Camera tilt"
              value={s.blackholeTilt}
              min={1}
              max={60}
              step={1}
              onChange={(v) => set({ blackholeTilt: v })}
              k="blackholeTilt"
            />
            <S
              label="Detail"
              value={s.blackholeDetail}
              min={40}
              max={120}
              step={4}
              onChange={(v) => set({ blackholeDetail: Math.round(v) })}
              k="blackholeDetail"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.blackholeUsePalette}
                onCheckedChange={(v) => set({ blackholeUsePalette: v })}
                k="blackholeUsePalette"
              />
            </div>
            <p className="text-[10px] leading-snug text-white/45">
              Detail is the per-pixel light-bending budget — lower it if the frame rate drops.
            </p>
          </>
        )}
        {s.view === "neoncity" && (
          <>
            <S
              label="Tower height"
              value={s.neoncityAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ neoncityAmplitude: v })}
              k="neoncityAmplitude"
            />
            <S
              label="Drive speed"
              value={s.neoncitySpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ neoncitySpeed: v })}
              k="neoncitySpeed"
            />
            <S
              label="Window density"
              value={s.neoncityDensity}
              min={0.05}
              max={1}
              step={0.05}
              onChange={(v) => set({ neoncityDensity: v })}
              k="neoncityDensity"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.neoncityUsePalette}
                onCheckedChange={(v) => set({ neoncityUsePalette: v })}
                k="neoncityUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "ocean" && (
          <>
            <S
              label="Wave height"
              value={s.oceanAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ oceanAmplitude: v })}
              k="oceanAmplitude"
            />
            <S
              label="Speed"
              value={s.oceanSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ oceanSpeed: v })}
              k="oceanSpeed"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Sun</Label>
              <Sw checked={s.oceanSun} onCheckedChange={(v) => set({ oceanSun: v })} k="oceanSun" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.oceanUsePalette}
                onCheckedChange={(v) => set({ oceanUsePalette: v })}
                k="oceanUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "nightwood" && (
          <>
            <S
              label="Canopy glow"
              value={s.nightwoodAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ nightwoodAmplitude: v })}
              k="nightwoodAmplitude"
            />
            <S
              label="Walking pace"
              value={s.nightwoodSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ nightwoodSpeed: v })}
              k="nightwoodSpeed"
            />
            <S
              label="Fireflies"
              value={s.nightwoodFireflies}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => set({ nightwoodFireflies: v })}
              k="nightwoodFireflies"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.nightwoodUsePalette}
                onCheckedChange={(v) => set({ nightwoodUsePalette: v })}
                k="nightwoodUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "desert" && (
          <>
            <S
              label="Dune height"
              value={s.desertAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ desertAmplitude: v })}
              k="desertAmplitude"
            />
            <S
              label="Drive speed"
              value={s.desertSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ desertSpeed: v })}
              k="desertSpeed"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Sun</Label>
              <Sw
                checked={s.desertSun}
                onCheckedChange={(v) => set({ desertSun: v })}
                k="desertSun"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.desertUsePalette}
                onCheckedChange={(v) => set({ desertUsePalette: v })}
                k="desertUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "station" && (
          <>
            <S
              label="Meter height"
              value={s.stationAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ stationAmplitude: v })}
              k="stationAmplitude"
            />
            <S
              label="Flight speed"
              value={s.stationSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ stationSpeed: v })}
              k="stationSpeed"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Beat chaser lights</Label>
              <Sw
                checked={s.stationChase}
                onCheckedChange={(v) => set({ stationChase: v })}
                k="stationChase"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.stationUsePalette}
                onCheckedChange={(v) => set({ stationUsePalette: v })}
                k="stationUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "hifi" && (
          <>
            <S
              label="Meter sensitivity"
              value={s.hifiAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ hifiAmplitude: v })}
              k="hifiAmplitude"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Peak hold</Label>
              <Sw
                checked={s.hifiPeakHold}
                onCheckedChange={(v) => set({ hifiPeakHold: v })}
                k="hifiPeakHold"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.hifiUsePalette}
                onCheckedChange={(v) => set({ hifiUsePalette: v })}
                k="hifiUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "tapedeck" && (
          <>
            <S
              label="Meter sensitivity"
              value={s.tapedeckAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ tapedeckAmplitude: v })}
              k="tapedeckAmplitude"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Peak hold</Label>
              <Sw
                checked={s.tapedeckPeakHold}
                onCheckedChange={(v) => set({ tapedeckPeakHold: v })}
                k="tapedeckPeakHold"
              />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.tapedeckUsePalette}
                onCheckedChange={(v) => set({ tapedeckUsePalette: v })}
                k="tapedeckUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "lab" && (
          <>
            <S
              label="Trace gain"
              value={s.labAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ labAmplitude: v })}
              k="labAmplitude"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Label spectrum peaks</Label>
              <Sw checked={s.labPeaks} onCheckedChange={(v) => set({ labPeaks: v })} k="labPeaks" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.labUsePalette}
                onCheckedChange={(v) => set({ labUsePalette: v })}
                k="labUsePalette"
              />
            </div>
          </>
        )}
        {s.view === "aurora" && (
          <>
            <S
              label="Brightness"
              value={s.auroraAmplitude}
              min={0.1}
              max={3}
              step={0.05}
              onChange={(v) => set({ auroraAmplitude: v })}
              k="auroraAmplitude"
            />
            <S
              label="Drift speed"
              value={s.auroraSpeed}
              min={0.1}
              max={4}
              step={0.05}
              onChange={(v) => set({ auroraSpeed: v })}
              k="auroraSpeed"
            />
            <S
              label="Ray sharpness"
              value={s.auroraRays}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => set({ auroraRays: v })}
              k="auroraRays"
            />
            <div className="flex items-center justify-between">
              <Label className="text-[11px]">Use selected palette</Label>
              <Sw
                checked={s.auroraUsePalette}
                onCheckedChange={(v) => set({ auroraUsePalette: v })}
                k="auroraUsePalette"
              />
            </div>
          </>
        )}
      </ViewControls>
    </div>
  );
}
