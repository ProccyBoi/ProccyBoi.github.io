# V2 Kiku demo audio

The v2-only adapter (`assets/v2-kiku-simulator.js`) uses the existing real WASM
framebuffer renderer unchanged and overlays locally hosted original demo music.
`assets/kiku-simulator.js`, the renderer binary and root/v3 routes stay unchanged.
The page must import the v2-only adapter through `assets/v2-kiku-explorer.js`.

## Interaction contract

- Loading the page does not create an AudioContext or fetch an audio file.
- Play demo or an explicit firmware transport action starts sound. The browser
  context is resumed synchronously in that gesture, before asynchronous fetch or
  decoding, including the prefixed AudioContext path for older Safari.
- Music and simulated Bluetooth use the displayed illustrative track. Left/right
  select its matching original loop. Disconnecting the simulated phone stops it.
- The four FM fixture frequencies map to the four original loops. Other tuning
  positions are silent. The copy identifies this as a preview, not radio reception.
- Play/pause reflects the firmware transport on Music/connected Bluetooth.
  FM has no firmware play toggle, so its browser Pause is explicitly local audio.
- Browser level is an independent master level multiplied by the device encoder
  volume. Mute does not alter the encoder setting or playback position.
- Pause retains offset, while new tracks start at zero. Reset returns Home and
  stops the music. Power off stops it. Track/pause changes have short click-safe fades.
- Hidden tab, pagehide, leaving the demo viewport, browser audio interruption or
  another mounted demo pauses sound. Returning does not resume it; a new play
  gesture is required. The bridge's local play flag is paused when accessible.
- Versioned starts ensure new track, Pause, reset and destruction win in-flight
  downloads/decodes/resume promises. Failed downloads are evicted for a real retry.
- Destroy disconnects the observer/listeners, aborts requests and closes context.
- Native buttons and a labelled range support keyboard/screen-reader operation;
  status is live text, not solely the framebuffer. There is no polling animation.

No device permission, recording, persistent storage, telemetry, external stream
or new dependency is involved. The MP3 provenance/license and reproducible source
are documented under `assets/kiku/audio/README.md`.

## Verification

Serve the repository root, then run:

    node scripts/kiku-simulator/verify.cjs
    node scripts/kiku-simulator/verify-audio.cjs --unit-only
    KIKU_BASE_URL=http://127.0.0.1:8766 node scripts/kiku-simulator/verify-audio.cjs

The browser test uses Playwright Chromium (override `CHROMIUM_EXECUTABLE`) or
WebKit (`--webkit`). It instruments the real master gain using an AnalyserNode to measure
nonzero PCM, silence and active source counts. It does not use an autoplay-policy
override or a fake AudioContext. Coverage includes each source enum, each transport,
position-preserving resume, firmware/browser volume, mute, repeated-click races,
delayed downloads, failed-download retry, power/reset, offscreen/visibility/pagehide,
context suspension, explicit resumption and cleanup. Visibility is simulated via
the native event handler in this test; physical Safari/iOS interruption behavior
still requires a real-device check.
