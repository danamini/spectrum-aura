# MIDI controller support

Updated 2026-10-02. Local implementation; no hardware certification yet.

## Delivered

- MIDI entry on the input screen and a dedicated MIDI settings tab.
- Existing instrument mappings retained; MIDI Learn for scene selection, effects,
  beat/downbeat, randomization and ten save slots.
- Device/channel-specific bindings, simultaneous input, selected-port filtering,
  incoming value monitor, editable/inverted ranges and optional slider pick-up.
- Controller configuration persists separately from saved visual looks.
- External MIDI tempo/transport: selected clock port, Start/Continue/Stop, song
  position, clock-loss freeze, and external timing routed through SongClock.
- Automated tests cover isolation, CC edge triggers, pick-up after preset changes,
  learning without triggering, unplug/reconnect, cleanup and permission denial.

## Open work

- [ ] MIDI-01: Verify the APC64 on hardware. Use Custom mode and its Project
      Editor to assign absolute CC touch strips. Learn Scene, Bloom and Hue, then
      move each strip through both endpoints. Verify USB reconnect preserves bindings.
- [ ] MIDI-02: Verify MiniLab 3 together with APC64, including identical CC/channel
      numbers routed to different targets. Use absolute CC encoder mode for this
      implementation; relative encoder modes are not implemented.
- [ ] MIDI-03: Verify incoming notes from Donner B1 and the Behringer drum machine
      simultaneously with controllers. Confirm the exact Behringer model (user wrote
      “RD 78”), MIDI ports and outgoing message types before claiming compatibility.
      An instrument's audio still needs microphone/system capture; MIDI is control
      data and does not carry its sound. Test external clock from the drum machine.
- [ ] MIDI-04: Implement an opt-in APC64 output profile after verifying its live
      LED protocol and required mode/port. Akai confirms Custom-mode pad/fader colours
      in its editor, but the public documentation reviewed did not supply a live
      output protocol. Do not assume another APC model's velocity palette applies.
      Acceptance: mapped/unmapped pad colours, active save/scene feedback, explicit
      output selection, no echo loop, and no output to other connected instruments.
- [ ] MIDI-05: Add relative CC encoder modes with explicit encoding selection and
      tests if required by the MiniLab 3 configuration. Current CC mapping is 7-bit
      absolute; aftertouch and pitch bend are not mapped.

- [ ] MIDI-06: Verify Ableton Live on hardware using [the setup guide](../midi.md).
      MIDI notes/CC automation and external clock/transport are implemented and
      tested with simulated ports. Verify Live start/stop, looping, position jumps,
      gradual tempo automation and sync delay before calling the integration proven.
- [ ] MIDI-07: Evaluate deeper Live information (clip/scene identity, names, colours,
      track levels and time signatures) through Max for Live or a control-surface
      bridge. Evaluate Link separately; its official SDK is native C++, not a browser
      API. Current Extensions documentation describes one-shot actions, so validate
      lifecycle before choosing it for a continuous connection.

## Research informing the implementation

- [Resolume MIDI shortcuts](https://resolume.com/support/en/7/midi-shortcuts):
  learnable mappings, input monitoring, device-scoped input/output routing.
- [Ableton MIDI remote control](https://www.ableton.com/en/manual/midi-and-key-remote-control/):
  slider pick-up prevents parameter jumps; relative encoders need a distinct mode.
- [Akai APC64 FAQ](https://support.akaipro.com/en/support/solutions/articles/69000844959-akai-pro-apc-64-frequently-asked-questions):
  Custom mode and Project Editor configure pad/touch-fader assignments and colours.
- [Arturia MiniLab 3 downloads](https://www.arturia.com/support/downloads-manuals/product/minilab-3):
  official manuals, editor and DAW integration scripts for hardware follow-up.

- [Ableton MIDI sync](https://help.ableton.com/hc/en-us/articles/209071149-Synchronizing-Live-via-MIDI): Live can transmit MIDI clock.
- [Ableton Link SDK](https://github.com/Ableton/link): native integration path.
- [Ableton Extensions](https://www.ableton.com/en/live/extensions): currently Suite beta, with one-shot execution described in its FAQ.
