# MIDI input and Ableton Live

Choose **Use MIDI controller** on the input screen, or **Settings → MIDI**.
MIDI can control Aura alongside microphone/system audio, or without audio.
It carries performance and timing data, not the instrument's sound.

## Map your controllers

Keep **Listen to → All connected devices** for a mixed rig. Beside a destination,
choose **Learn**, then move its knob/slider or hit its pad. Learn consumes the
first message without applying an action. Assignments remember the device,
channel and note/CC number, so identical CC numbers on different devices can
control different destinations. Device-specific mappings override matching
factory any-device mappings. Learning the same physical control again replaces
its previous assignment; there is one binding per destination in this version.

Use **Scene** to sweep through the visual registry. Effect destinations include
Bloom, Exposure, Chroma, Hue, Grain, Vignette and Glitch intensity. Set **From/To**
to narrow or reverse a range. Enable **Pick-up** for sliders to wait until they
cross the current parameter value after a preset changes. Pads can drive
continuous destinations by velocity; CC buttons trigger actions on their rising
halfway threshold. Note releases do not trigger actions.

Mappings persist in this browser separately from visual saves. The live readout
shows device, channel, message number and incoming value, including unmapped
messages. Use **Restore factory mappings** to return to the original layout.

For APC64, configure touch strips as absolute CCs in Custom mode. MiniLab 3
encoders should also send absolute values. Relative encoders, aftertouch, pitch
bend and LED output are not implemented yet. Hardware verification is tracked
in [the MIDI plan](plans/midi-controller-support.plan.md).

## APC64 performance layout example

In Custom mode, assign touch strips to absolute CC messages, then learn them
in Aura. This is a suggested layout, not an automatic APC64 device profile:

| Control     | Aura destination              | Result                                              |
| ----------- | ----------------------------- | --------------------------------------------------- |
| Touch strip | Scene                         | Sweep through the available visuals                 |
| Touch strip | Bloom or Hue                  | Adjust the effect continuously                      |
| Pad         | Load save 1–10                | Recall a saved look, including its scene and FX     |
| Pad         | Random visual or Randomize FX | Trigger a new visual or effect setup                |
| Pad         | Beat tap or Downbeat          | Tap tempo or reset the phrase; leaves external sync |

For a pad that always selects a particular scene, save the desired look first
and learn its **Load save** destination. The continuous **Scene** destination
uses the incoming value, including pad velocity, to select a visual; it is not
a dedicated named-scene command.

Keep **All connected devices** selected when adding a MiniLab 3 or other MIDI
instruments. Learn each device's controls separately. The supported input path
is generic MIDI notes and absolute CCs; the APC64, MiniLab 3, Donner B1 and
Behringer drum-machine rig still need physical verification. A device must
actually transmit the relevant messages on its selected MIDI port.

## Connect Ableton Live on macOS

1. In Audio MIDI Setup, open MIDI Studio and enable an IAC Driver bus, e.g.
   **Aura**. [Apple's IAC instructions](https://support.apple.com/en-ie/guide/audio-midi-setup/ams1013/mac).
2. In Live's MIDI port settings, enable **Track** on that output for notes/CCs
   and **Sync** for clock/transport. Route a dedicated MIDI track to the bus;
   its clips can contain scene triggers and CC envelopes for effect automation.
   [Live MIDI routing](https://www.ableton.com/en/manual/routing-and-i-o/).
3. In Aura, enable MIDI and select that bus under **Tempo & transport source**.
   Performance input selection is independent: keep All connected devices to
   use the APC64 and other controllers alongside Live.
4. Start Live's transport. Aura shows MIDI tempo and position, and its existing
   beat grid drives scenes and phrase cycling. Start resets position, Continue
   resumes, and Song Position Pointer handles position supplied by Live.
5. Capture Live's audio separately with system audio if you want spectral and
   loudness response as well. MIDI sync works without audio capture.

Live can send MIDI clock; actual visual latency still includes MIDI scheduling
and display/render latency. Test Live's per-port sync delay against the audio
path used for the performance. [Ableton MIDI sync](https://help.ableton.com/hc/en-us/articles/209071149-Synchronizing-Live-via-MIDI).

Choose one clock port. Aura does not merge competing clocks. While external
sync is selected, audio BPM cannot take over; stopped/lost clock freezes the
beat grid. If clock is lost, restart transport to establish position. Press
**T/Shift+T** to leave external sync and use manual taps again.

The grid assumes 4/4. MIDI clock does not provide clip names, scene colours or
time signatures. Those need a separate Live integration. Ableton Link is also
a separate integration path, not enabled by these MIDI settings.
