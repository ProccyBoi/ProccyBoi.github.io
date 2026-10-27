# Dash case study

The original page at `/projects/dash/` is the source for `/v2/projects/dash/`. The v2 generator applies `normalized(enrich_case(make_case(path), 'dash'))` to that source; use the same pipeline when regenerating only Dash. Run `python scripts/build-v3-pages.py` afterwards to update its derived v3 interior.

## Evidence

Reviewed 27 October 2026 against firmware revision `c3094732c2db8c5159d10f8354bbecaf0fd14726` in [JPhusion/dash](https://github.com/JPhusion/dash/tree/c3094732c2db8c5159d10f8354bbecaf0fd14726). This immutable revision provides evidence for the claims below.

- `src/main.cpp`: tap acknowledgement, double-tap start/stop after onboarding, shake/spin reactions, face-up menu after two seconds and face-down sleep after three seconds outside sessions.
- `src/dash/imu.cpp`: 10 ms sampling and orientation hysteresis.
- `src/dash/state_machine.h`, `src/dash/display.h`: coordinated device state and a dedicated display task with mutex-protected target state.
- `src/dash/session.cpp`: running/paused accounting, completion and early-cancellation expressions.
- `src/dash/stats.cpp`: local NDJSON session log rotated at 64 KiB.
- `src/dash/portal.cpp`: locally served phone interface, sessions, settings, statistics and games.
- `src/dash/power.cpp`, `src/dash/pins.h`: 240/80 MHz profiles and light sleep to support the motion interrupt on GPIO19. The function name `enterDeepSleep` is historical; the current path calls `esp_light_sleep_start`.

The previous claim that a session survives resets was removed: RTC helpers exist, but recovery was not verified in startup. ESP-NOW group sessions remain experiments needing further integration and a second unit, not a completed synchronisation feature. No measured power figures are claimed.

Existing `dash1-web.jpg` and `dash2-web.jpg` show the earlier vehicle prototype, not the present desk companion. Keep that distinction in visible captions, alt text and metadata. No fabricated hardware photography was added.

## Animated PCB assembly

The separate `#prototype` studio uses the archived July 2025 `Driving Companion.stl`, matched to its contemporary `PCB/Driving Companion.kicad_pcb`. The folder named “Driving Companion V2” and the later September root PCB are different revisions; do not use their placement data to describe this mesh. The original source files remain unchanged. The current complete device assembly remains the main `#explore` viewer, with its own housing, display, speaker, battery and wiring assets.

The model is the populated prototype PCB, not the modern cube enclosure or a complete device model. Some packages present in the layout are missing from the archived STL; they are not filled in with invented geometry. The asset manifest records those omissions, source hashes, component grouping, material choices and the removal of identifying student text from the derivative.

The studio presents a finite assembly sequence with play/pause/replay, component-position controls, a scrubber and camera views. Exploded offsets are for inspection, not a manufacturing procedure. Its code is `assets/dash-prototype-studio.js`; `assets/dash-assembly.js` is the separate complete-device constructor and must remain intact. The model and local 3D runtime load when the studio enters view. Rendering stops when settled and pauses offscreen or in a hidden tab. Reduced motion uses direct state changes. The original prototype photograph remains available when JavaScript, WebGL or model loading is unavailable.

Regenerate with `python scripts/build_dash_assets.py --stl <archived-STL> --pcb <matching-July-PCB>` (NumPy required). The derived GLB is about 1.83 MB, with 56 part nodes and 128,066 retained source triangles. Run `node scripts/verify-dash-assembly.cjs` against the preview to check movement, direct inspection, idle rendering, responsive layout and failures. Use a normal GPU-backed browser for animation timing; forcing CPU-only WebGL can reduce the frame rate severely.

## Browser interaction sketch

This is an explicitly labelled illustration, not firmware emulation. Eyes are drawn in CSS. The default 10-second session makes completion easy to explore; 25-, 45- and 60-minute countdowns are also available. Pause/resume/reset affect this browser session only. Nothing is persisted, uploaded or played as audio.

The timer uses a wall-clock deadline, reconciles when a hidden tab returns, and has no idle rendering loop. A one-time welcome, staggered double blink, dizzy shake, settling expressions and completion bounce are finite. Mouse gaze is bounded and returns to center on exit. Reduced-motion users receive static state changes, including when their preference changes during a sequence. Live announcements describe state changes without announcing every second. The static face, engineering story and source links remain usable without JavaScript; inactive controls stay hidden.

Run `node scripts/verify-dash-browser.cjs` against the local preview for behavioral and layout checks. The repository-wide `audit-v2.py` validates generated links, metadata and document structure.
