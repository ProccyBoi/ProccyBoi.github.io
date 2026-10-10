# v3 portfolio validation

This document records the public feature contract and how it is checked. A
source audit or geometry test is not evidence that a browser rendered correctly.
Browser results and their screenshots are written separately for each run.

## Public inventory

The project collection contains **15 projects**, matching the maintained v2
inventory:

- Hardware (12): TramTrace, Skylabs, Dual USB-C Framework Card, Framework ESP32
  Card, Raspberry Pi Expansion Card, Framework Logic Analyser, RGB Drink Coaster,
  LoRa Receiver + GNSS, RF Test Board, Metroboard, Switchmode Power Supplies and
  Tamagotchi SD Card
- Robotics (1): rUNSWift
- Archive (2): LoRa Talkie and Dash

The v3 tree contains the home and **23 preserved interiors**. The interiors
comprise the collection, About, the 15 project pages, two Skylabs board pages,
three browser teaching tools and the Flight Review redirect.

The original homepage is `/`, with earlier project and tool routes under
`/projects/`; there is no separate `/v1/` directory. `/v2/` remains independently
available. `/v3/` must preserve these useful destinations:

| Function | Destination / behavior |
| --- | --- |
| Complete project collection | `/v3/projects/`, exactly 15 searchable projects |
| Profile and experience | `/v3/about/` |
| Public CV | `/assets/documents/Andrew_Chung_Public_CV.pdf` |
| Contact | `mailto:andrew.noah.chung@gmail.com` and About contact section |
| Booking | `/book/`; route validation does not submit a booking |
| Public files | `/shared/` |
| Flight Review | `/shared/flight-review/`; existing v3 redirect retained |
| Teaching tools | ScopeLab, optical lithography and MOSFET operating regions under `/v3/projects/` |
| Legacy comparisons | Existing root and v2 routes remain intact |

Teaching tools are linked separately and must not be counted as extra projects.
The public files, booking, CV and tool destinations must be discoverable from
home, collection or About, rather than merely existing as orphaned URLs.

## Test commands

Run from the repository root:

```sh
python scripts/build-v3-pages.py --check
python scripts/audit-v3.py
node scripts/verify-v3-story-controller.cjs
node scripts/verify-v3-direct-transition.cjs
node scripts/verify-v3-film-peel.cjs
node scripts/verify-v3-portfolio.cjs --static-only
```

For live browser acceptance, serve the repository root and run the new suite:

```sh
python -m http.server 8080 --bind 127.0.0.1
# In another terminal:
node scripts/verify-v3-portfolio.cjs
```

Install Playwright and its Chromium browser if the environment does not already
provide them:

```sh
npm install --no-save playwright
npx playwright install --with-deps chromium
```

The suite uses the installed `playwright` package and its bundled Chromium by
default. CI installs the pinned version defined in its workflow.

Environment options:

- `V3_BASE_URL`: preview origin or its `/v3/` URL; default
  `http://localhost:8080/v3/`
- `CHROMIUM_EXECUTABLE`: optional path to a compatible installed Chromium.
  Leave unset to use Playwright's browser, including in CI
- `V3_SCREENSHOTS`: artifact directory; default `.codex-temp/v3-portfolio`
- `V3_PEEL_REFERENCE`: accepted aircraft scene revision for the focused
  direct-transition regression; its default is `HEAD`

A full browser run writes `results.json`, desktop and mobile screenshots, and
per-failure screenshot/request/error evidence when a page was available. Full-page
captures first scroll each rendered, meaningful photograph into view, await its
actual lazy-load/IntersectionObserver load and decode, and restore the original
scroll position. The JSON records decoded sources and dimensions. Hidden
alternate posters are excluded; loading is never forced eager globally, and a
meaningful image failure fails the test. It
returns a nonzero exit status on failure or browser-launch blockage. A blocked
browser is explicitly reported as blocked, even when every source check passes.
A `--static-only` result explicitly excludes browser verification.

## Acceptance matrix

| Area | Automated acceptance |
| --- | --- |
| Inventory | Same 15 project slugs, all 23 interiors, tools excluded from project count |
| Discoverability | Projects, About, CV, email, booking, public files, Flight Review and three teaching tools reachable from core pages |
| Desktop navigation | Useful heading/copy, working skip link, collection navigation |
| Mobile navigation | Enter opens, Escape closes and restores focus, selected navigation follows the correct route |
| Search | Query and category URL initialization, four Framework results, reload restoration, empty state, Escape reset, all category counts |
| Browser history | Real Back and Forward restore query/result state while retaining unrelated query parameters |
| TramTrace workbench | In-page production copper layers, ten component groups, matching source data, 24-frame rotation controls, every chain and frame readout, keyboard/pointer stepping, playback interruptions and denied-WebGL narrow layout |
| Photo gallery | Real case-study dialog opens by keyboard, arrow navigation, modal focus containment, Escape/Close restoration and repeated opening |
| Shared destinations | All preserved interior routes and shared files/booking/Flight Review/CV return meaningful responses; redirect actually arrives at Flight Review |
| No JavaScript | Visible navigation, aircraft and telemetry copy/poster, complete collection, native photographs |
| Reduced motion | Static aircraft without automatic model/Three downloads |
| Save Data | Static aircraft without automatic model/Three downloads |
| Short viewports | Static aircraft avoids long pinned sequence and model downloads |
| Graphics failure | Explicitly denied WebGL produces readable static fallback with project navigation |
| Resource failure | Failed aircraft asset and failed controller preserve useful source content and links |
| Actual rendering | Separate normal-preference run requires a successful CAD frame, ready telemetry with 153 components and visible canvas; fallback is a failure for this test |
| Responsive layout | Core home/collection/About/TramTrace at 1440×900, 390×844, 320×568 and 844×390; all non-redirect interiors at 320×740 without JavaScript |
| Diagnostics | Unhandled page exceptions, local HTTP failures and shader compilation errors fail their test |

The aircraft rendering test uses the production URL, without enabling the
capture global. It checks keyboard destination navigation and records actual
renderer state. Desktop stopped/telemetry captures are followed by a real resize
to 390×844 and navigation back to Aircraft and onward to Telemetry. Each capture
waits for a new rendered frame and the actual destination pose, verifies selected
copy fits between the header and navigation, and rejects horizontal overflow.
The mobile captures therefore show the live renderer with the Andrew Chung
heading, rather than a motion-reduced poster. The dedicated aircraft suite remains the deeper rendering,
lifecycle, context-loss and scene-framing check:

```sh
node scripts/verify-v3-aircraft.cjs
```

The portfolio suite exercises the integrated TramTrace copper/data workbench in
detail. For other tools, it checks destinations and preserves controllers through
`audit-v3.py`; it does not claim to re-test every teaching
simulation, hardware protocol or external booking backend. Existing focused
hardware and aircraft suites should also run when their implementation changes.

## Approved aircraft contract

The only two story destinations are Aircraft and Telemetry. No Anatomy chapter,
numbered detail overlay or intermediate electronics-inspection stop is allowed.
The aircraft skin must be completely clear before rigid exterior motion starts.
The real source geometry, accepted peel deformation and reversible poses remain
authoritative.

The renderer-free direct-transition test samples the actual meshes and asserts
no concurrent visible skin and rigid motion, a clearance interval, unchanged
accepted film poses, monotonic camera focus and full telemetry framing. The
film-peel suite separately checks source buffers, assembled envelope, winding,
finite motion, ground clearance, reversal and detailed:false v2 compatibility.

## Observed local results, 10 October 2026

Before the presentation changes, the existing checks passed:

- Generation: 23 interiors, 0 outdated
- v3 audit: 24 routes, 23 indexable pages, 23 preserved interiors, 328 local files
  and 7 model manifests
- Story controller: two destinations, focus transfer, deep-link anchors,
  fallback restoration and unchanged three-chapter v2 logic
- Direct transition: 213 poses, zero rigid motion while skin is visible; last
  sampled visible skin at progress 0.595 and first rigid motion at 0.620001
- Film peel: all 13 check groups passed, including unchanged v2 compatibility

The new portfolio source checks passed against the in-progress overhaul after
resource navigation was restored. They must be rerun against the final tree.

Local live browser testing was **blocked before the first page opened**.
Installed Chromium failed at `chrome/browser/process_singleton_posix.cc:297`
with `socket() failed: Operation not permitted`, including a launch retried with
explicit cloud process/socket permission. This is a browser-launch restriction,
not a demonstrated site failure. No local rendered screenshots or interaction
passes are claimed. A browser-capable CI or preview environment must run the
full suite and provide the actual `results.json` and screenshots before visual
acceptance can be considered complete.


## Integrated TramTrace workbench

The original root workbench is also available directly in the v3 case study at
`/v3/projects/tramtrace/#copper-data`. Its wrapper owns the inspection state;
the separate v3 WebGL assembly viewer remains in place. It uses the original
board-data, component-data and inspector controller, in their original order.
The root page and shared source data are unchanged.

The source-backed chain inventory is:

| Chain | Pixels | Full-frame colour bits | Wire time at 800 kbit/s |
| --- | ---: | ---: | ---: |
| L1 | 45 | 1080 | 1.35 ms |
| L2 | 8 | 192 | 0.24 ms |
| L3 | 30 | 720 | 0.90 ms |
| L4 | 32 | 768 | 0.96 ms |
| Status | 1 | 24 | 0.03 ms |
| Total | 116 | 2784 | Each chain is inspected independently |

Tests verify all 116 distinct source LED references, their coordinates and copper
segments, ten component groups, the shared 24-bit/800 kbit/s constants and exact
browser-loaded data parity. The Copper mode displays both fabrication layers
together, matching the original workbench's controls.

Browser interaction checks include:

- Assembled/Copper/Data selection by keyboard, decoded visible copper layers
- Each of the ten component-directory choices, matching hotspot state, repeated
  selection clearing, Escape clearing and annotation visibility
- Rotation by arrow keys, Home, next/reset buttons and wrapping through 24 frames
- All five chain buttons; native range step, Home/End and real pointer scrubbing
- Correct progress, consumed bits, wire time and first/final LED readouts
- Play/pause, reset, rapid repeated activation, replay after completion and
  cancellation when changing chain, scrubbing, changing layer or rotating
- Offscreen pause preserves the current frame step; returning to the workbench
  does not restart playback automatically
- A wait longer than two playback ticks after interruption to catch orphaned
  timers rather than merely checking the button label
- Actual nontransparent pixel/path drawing in the 2D canvas
- Separate denied-WebGL checks at 320 px and 390 px: controls remain within the
  page, the board can pan inside its own viewport, and all 32 L4 pixels can be
  stepped through without a 3D renderer

The source inventory and browser interaction groups passed together in the
second CI run recorded below.

### Initial CI result and test-harness correction

The first browser-capable CI run passed 16 of 18 checks, including actual aircraft
WebGL rendering, core responsive pages and all narrow interior pages. It found a
real gallery focus-containment issue and a redirect-test race. In the latter,
`document.fonts.ready` was evaluated in the old Flight Review redirect document
while that document was being replaced. The test now navigates, waits for the
final `/shared/flight-review/` URL and its load event, and only then accesses
fonts. The gallery containment assertion remains strict. The initial partial result was not an acceptance pass; the corrected suite and
new TramTrace coverage were checked together in the second run.


## Diagnostic performance measurements

The desktop-home result records Navigation Timing DOMContentLoaded/load elapsed
milliseconds and Resource Timing count, transfer bytes and decoded bytes both
initially and after scrolling the complete page. The real WebGL result records
those timings plus elapsed time to the first rendered frame, telemetry readiness
and the renderer's frame counter. Values are observations from the local preview
or CI machine, without network throttling or a physical phone. Zero transfer
sizes may reflect cache or unavailable timing. These diagnostics are neither
user-network/mobile benchmarks nor a synthetic performance score.

## Observed browser acceptance

[CI run 38092116611](https://github.com/ProccyBoi/ProccyBoi.github.io/actions/runs/38092116611)
passed all **23 of 23** source and browser test groups on commit
`de3405e454e227f85f21293f4b9c5b587c98fa2d`. Chromium 143 rendered the real
aircraft and all 153 telemetry components using SwiftShader. The integrated
TramTrace controls, strict gallery focus containment, collection/history,
responsive interiors and fallback modes all passed. Desktop and mobile full-page
captures were taken only after scrolling each visible photograph into view and
verifying its decoded dimensions, eliminating misleading lazy-load placeholders.

The next acceptance run additionally captures and verifies the real rendered
aircraft and telemetry destinations at 390 × 844, including selected-copy
visibility, fit between fixed controls, completed transitions and new render
frames. A resized desktop Chromium viewport is not a physical-device test.
