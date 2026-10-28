# Dash case study

The original page at `/projects/dash/` supplies the factual source for `/v2/projects/dash/`. The v2 generator applies `normalized(enrich_case(make_case(path), 'dash'))`, including its Dash-only simplification and `scripts/content/v2-dash-details.html`; use that pipeline when regenerating only Dash. The v2 changes do not require regenerating or changing the frozen v3 interior.

## Current v2 page (28 October 2026)

The page contains one complete-device assembly, specifications, two short context paragraphs and the firmware source link. Its navigation is Overview, Assembly and Details. The viewer retains drag/keyboard rotation, zoom, physical part identification and Disassemble/Assemble. `project-integrated.css` supplies the assembly section's layout independently of the removed demo styles.

The prototype PCB studio, character sketch, timer, gesture controls and redundant gallery are removed from the v2 HTML and its dependencies. `assets/v2-hardware.js` loads the optional live display bridge only when a character controller exists, so the simplified v2 case does not fetch or mount those controls. The full Dash homepage assembly uses a static idle OLED image; see [v2-dash-hero.md](v2-dash-hero.md).

The evidence and dated studies below describe retained firmware, assets and earlier presentations. Their interactive suites are not proof of acceptance for the simplified v2 page; check the current assembly and page directly and run `scripts/audit-v2.py` for generated links and structure.

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

## Earlier prototype studio (retained outside the simplified v2 case)

The separate `#prototype` studio uses the archived July 2025 `Driving Companion.stl`, matched to its contemporary `PCB/Driving Companion.kicad_pcb`. The folder named “Driving Companion V2” and the later September root PCB are different revisions; do not use their placement data to describe this mesh. The original source files remain unchanged. The current complete device assembly remains the main `#explore` viewer, with its own housing, display, speaker, battery and wiring assets.

The model is the populated prototype PCB, not the modern cube enclosure or a complete device model. Some packages present in the layout are missing from the archived STL; they are not filled in with invented geometry. The asset manifest records those omissions, source hashes, component grouping, material choices and the removal of identifying student text from the derivative.

The studio presents a finite assembly sequence with play/pause/replay, component-position controls, a scrubber and camera views. Exploded offsets are for inspection, not a manufacturing procedure. Its code is `assets/dash-prototype-studio.js`; `assets/dash-assembly.js` is the separate complete-device constructor and must remain intact. The model and local 3D runtime load when the studio enters view. Rendering stops when settled and pauses offscreen or in a hidden tab. Reduced motion uses direct state changes. The original prototype photograph remains available when JavaScript, WebGL or model loading is unavailable.

Regenerate with `python scripts/build_dash_assets.py --stl <archived-STL> --pcb <matching-July-PCB>` (NumPy required). The derived GLB is about 1.83 MB, with 56 part nodes and 128,066 retained source triangles. Run `node scripts/verify-dash-assembly.cjs` against the preview to check movement, direct inspection, idle rendering, responsive layout and failures. Use a normal GPU-backed browser for animation timing; forcing CPU-only WebGL can reduce the frame rate severely.

## Earlier browser interaction sketch (removed from v2)

This is an explicitly labelled illustration, not firmware emulation. Eyes are drawn in CSS. The default 10-second session makes completion easy to explore; 25-, 45- and 60-minute countdowns are also available. Pause/resume/reset affect this browser session only. Nothing is persisted, uploaded or played as audio.

The timer uses a wall-clock deadline, reconciles when a hidden tab returns, and has no idle rendering loop. A one-time welcome, staggered double blink, dizzy shake, settling expressions and completion bounce are finite. Mouse gaze is bounded and returns to center on exit. Reduced-motion users receive static state changes, including when their preference changes during a sequence. Live announcements describe state changes without announcing every second. The static face, engineering story and source links remain usable without JavaScript; inactive controls stay hidden.

Run `node scripts/verify-dash-browser.cjs` against the local preview for behavioral and layout checks. The repository-wide `audit-v2.py` validates generated links, metadata and document structure.

## Earlier live full-device study (28 October 2026)

The earlier v2/v3 complete-device presentation subscribed to the existing character
controller; it does not create a second session or timer. Controls beside the
model and in the character section address the same countdown, pause/resume,
reset, duration and gesture state. The existing illustrative CSS character stays
available even when 3D fails. The archived July prototype studio is unchanged.

`assets/dash-demo.js` exposes a snapshot/subscription/command interface on its
own demo element. `assets/dash-display.js` turns that state into a 128 × 64,
one-bit framebuffer used by both the small OLED preview and the device mesh.
Its eye dimensions, offsets and mirroring follow the retained firmware eye
presets; its Canvas rasterizer, bitmap clock and finite gestures remain a browser
adaptation, not execution of the ESP32 firmware. Attribution and license terms
are retained in the source. The deliberate 10-second demo remains available.

`assets/dash-device.js` mounts the bridge and inspection controls only in the
complete device viewer. Front/rear/angled camera presets and a reversible shell
visibility toggle expose the construction without modifying source meshes or
component placements. The OLED viewing surface is moved forward by 0.055 mm
relative to its previous position to avoid glass depth fighting; it remains
behind the housing wall. The existing exploded endpoints are preserved, with
slower device-only transition damping. Rendering is capped at 30 fps during
finite expressions and stops while settled, hidden or offscreen. Reduced motion
uses static expressions. The 3D runtime stays available if the optional display
adapter fails to load.

Run `scripts/verify-dash-live.cjs` for shared-state/framebuffer, inspection,
responsive and idle lifecycle checks in v2/v3, plus the existing
`verify-dash-browser.cjs`, `verify-dash-device.cjs` and
`verify-dash-assembly.cjs` suites for retained content and separate model paths.
These checks describe that earlier live-controls revision, not the simplified
current v2 case. The source baseline for that revision is remote main `aa49484`. Direct live-site
and Pages deployment API access were blocked in the editing environment; local
renders of that fetched revision establish the comparison, not proof of the
current deployment's response. No new reference photographs were available as
readable pixels, so photo-dependent proportion changes remain outstanding.
