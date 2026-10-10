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

The suite uses the normal `playwright` package resolution first. The existing
cloud environment's `/opt/codex/cua_node/lib/node_modules/playwright` is a fallback
only; it is not required by CI.

Environment options:

- `V3_BASE_URL`: preview origin or its `/v3/` URL; default
  `http://localhost:8080/v3/`
- `CHROMIUM_EXECUTABLE`: optional path to a compatible installed Chromium.
  Leave unset to use Playwright's browser, including in CI
- `V3_SCREENSHOTS`: artifact directory; default `.codex-temp/v3-portfolio`
- `V3_PEEL_REFERENCE`: accepted aircraft scene revision for the focused
  direct-transition regression; its default is `HEAD`

A full browser run writes `results.json`, desktop and mobile screenshots, and
per-failure screenshot/request/error evidence when a page was available. It
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
renderer state. The dedicated aircraft suite remains the deeper rendering,
lifecycle, context-loss and scene-framing check:

```sh
node scripts/verify-v3-aircraft.cjs
```

The portfolio suite checks existing tool destinations and preserves their
controllers through `audit-v3.py`; it does not claim to re-test every teaching
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
