# Spectrum Aura — Technical Documentation

Setup guides and technical reference for controllers, audio, musical sync and rendering.

Start with [MIDI input and Ableton Live](midi.md) to connect controllers, learn
scene/effect mappings, monitor incoming messages and select an external clock.

| Document                                                     | Contents                                                                        |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| [midi.md](./midi.md)                                         | MIDI Learn, multiple controllers, APC64 examples, Ableton setup and limitations |
| [DEVELOPMENT.md](./DEVELOPMENT.md)                           | Project structure, workflows, testing, conventions                              |
| [audio-analysis-pipeline.md](./audio-analysis-pipeline.md)   | FFT, bands, BeatMatcher, BPMDetector (equations + code map)                     |
| [song-clock-and-sync.md](./song-clock-and-sync.md)           | Authoritative SongClock, taps, bar grid, view cycle                             |
| [rendering-and-latency.md](./rendering-and-latency.md)       | rAF loop, GPU path, latency budgets, HUD bus                                    |
| [fft-and-beat-detection.md](./fft-and-beat-detection.md)     | Short overview (links to detailed docs)                                         |
| [retro-systems-and-postfx.md](./retro-systems-and-postfx.md) | Retro hardware emulation pass, fonts, pipeline order, locks                     |
| [THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md)             | Runtime asset licensing                                                         |

- [Response and automatic balance](response-and-balance.md): visual gain, feedback limits and persistence.
- [v0.4.0 completion plan](plans/controls-and-balance.plan.md): requested work, verification and release checklist.

## Quick mental model

```
Audio → FFT → BeatMatcher + BPMDetector ─┐
Manual taps ────────────────────────────┼→ SongClock → beat/bar grid
Selected MIDI clock + transport ────────┘       ↓
                                      Scene + Post-FX + HUD + view cycle
MIDI notes/CCs → learned mappings → scene/effect settings and actions
```

Manual taps (`T`, `⇧T`) leave external sync and anchor grid position. While a
MIDI clock source is selected, audio estimates cannot override it. SongClock
remains the sole owner of the visual beat/bar grid.

## Demo-scene text overlay

The "Demo-scene text overlay" (Post FX tab) layers moving/bouncing/scrolling
phrases on top of whichever visual is active. Two sources are available via a
swappable `TextSource` interface (`engine/text-sources/types.ts`):

- **Public Domain Library** (default): curated snippets bundled locally with
  author/work/rights metadata — fully offline.
- **BOFH API**: phrases from [bofh.bombeck.io](https://bofh.bombeck.io) in
  small batches; may require network, with an embedded offline fallback list.

Every snippet carries attribution metadata (`TextSnippet`), and the current
snippet's credit line is surfaced in the Stats for nerds panel.
