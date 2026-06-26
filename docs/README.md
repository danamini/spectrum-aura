# Spectrum Aura — Technical Documentation

Deep reference for contributors, users tuning sync, and coding agents.

| Document                                                   | Contents                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------- |
| [DEVELOPMENT.md](./DEVELOPMENT.md)                         | Project structure, workflows, testing, conventions          |
| [audio-analysis-pipeline.md](./audio-analysis-pipeline.md) | FFT, bands, BeatMatcher, BPMDetector (equations + code map) |
| [song-clock-and-sync.md](./song-clock-and-sync.md)         | Authoritative SongClock, taps, bar grid, view cycle         |
| [rendering-and-latency.md](./rendering-and-latency.md)     | rAF loop, GPU path, latency budgets, HUD bus                |
| [fft-and-beat-detection.md](./fft-and-beat-detection.md)   | Short overview (links to detailed docs)                     |
| [THIRD_PARTY_ASSETS.md](./THIRD_PARTY_ASSETS.md)           | Runtime asset licensing                                     |

## Quick mental model

```
Audio capture → FFT bands → BeatMatcher (onsets) + BPMDetector (tempo estimate)
                                    ↓
                              SongClock (authoritative bar/beat phase)
                                    ↓
              Scene + Post-FX + BarTimingHud + ViewCycleController
```

Manual taps (`T`, `⇧T`) override grid position. Audio analysis estimates tempo but does **not** advance the bar grid after manual lock.
