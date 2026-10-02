# Response and automatic balance

The Response control lives in the bottom toolbar. It scales visual audio bands
and FFT bins from 0.25× to 4×, with 1× as the neutral bypass. Minus decreases it;
plus or equals increases it. The keys use the slider's logarithmic step and leave
text entry, focused sliders and browser zoom shortcuts alone.

## Signal path

`VisualResponse.apply()` copies the analysed bands into the scene input, then
scales bass, mid, high, onset strength and spectrum bins. It reuses its spectrum
buffer. Source bands, centroid and detector timing remain intact. SongClock still
supplies the scene's authoritative BPM and beat phase. Response changes neither
audio playback volume nor the onset/BPM detector's input.

`visualResponse` and `autoBalanceEnabled` are session calibration settings. They
persist locally and survive loading saved looks. They do not make a saved look
dirty. Defaults are 1× and Auto balance on. Legacy settings that lack the toggle
inherit on; an explicit saved false stays off.

## Feedback behavior

`VisualBalanceMonitor` samples a 32×18 copy of the rendered WebGL canvas immediately
after rendering, at most four times per second. HUD elements are excluded.
`measureFrame` measures lit-pixel brightness, white coverage and frame-to-frame
luminance change. It models the current CSS brightness correction while measuring
activity from uncorrected pixels, so its own exposure changes cannot fake motion.

The controller waits two seconds before evaluating sustained problems. It ignores
silence and inactive sources. Dark correction assesses visible content rather than
assuming intentional black backgrounds are faults. Sustained excessive brightness
reduces exposure; sustained dark content increases it. Sustained low activity with
an active signal increases visual response. Recovery in activity eases that response
correction toward neutral.

Exposure stays between 0.55× and 1.8×. Automatic response correction stays between
1× and 2×; combined manual/automatic response stays within the slider's 0.25×–4×
limits. Corrections are temporary, reset on settings/view/source changes, and do
not overwrite saved looks. Turning Auto balance off removes the brightness filter
and returns to the manual Response value.

## Cost and limitations

A sample over 4 ms lowers sampling to once per second. Three consecutive samples
over 12 ms pause balancing and reset its corrections. Sampling errors also pause
balancing without stopping rendering. Performance Mode, VR and hidden documents
suspend balancing; view transitions wait to settle before sampling.

The UI reports settling, balanced, brightening, dimming, adding motion, quiet,
limit reached or a pause reason. Its tooltip explains the behavior and shows the
current exposure and response correction.

This is bounded visual feedback. CSS brightness cannot restore detail already
clipped by a shader, and gain cannot create movement in a view with no reactive
movement. It does not retune individual effects, camera movement or animation speed.

Local browser sampling during development measured 2.3–4.0 ms per sample after
backoff to roughly once per second. This is sample CPU time on that run, not an
end-to-end FPS or GPU-performance guarantee. The manual Response path adds no
canvas readback.
