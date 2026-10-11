# Tactile project folio validation

## Review scope

This is a new landing preview for review. The rejected v2-style landing is
replaced by a three-project photographic folio. The accepted aircraft and
telemetry sequence follows it. The original site, v2, 15-project collection,
23 interiors, source photographs and approved aircraft geometry are preserved.
A review-branch test does not authorize publishing the preview over main.

The landing owns its dark base, type hierarchy and navigation styling in
`assets/v3-folio.css`; it does not load `v2.css`, `v2-gallery.css`, the old gallery
controller, the previous landing layer or the warm interior theme. The shared
small navigation controller remains. Source checks enforce the actual routes,
source photographs and final stylesheet rather than the rejected palette.

## Running checks

```sh
python scripts/build-v3-pages.py --check
python scripts/audit-v3.py
node scripts/verify-v3-portfolio.cjs --static-only
python -m http.server 8080 --bind 127.0.0.1
# Separate terminal, with Playwright and Chromium available:
V3_SCREENSHOTS=.codex-temp/v3-folio node scripts/verify-v3-portfolio.cjs
```

`V3_BASE_URL` accepts the local origin or its `/v3/` URL. The suite uses
Playwright's packaged Chromium unless `CHROMIUM_EXECUTABLE` is set. It writes
`results.json`, screenshots and failure records containing requests, runtime
errors and available touch-input diagnostics. A blocked launch is reported as
blocked, never as a browser pass.

The audit distinguishes the document's head title from accessible SVG titles.
It checks the new landing's precise includes and optional local animation import,
while preserving every existing interior/controller and aircraft asset check.

## Folio acceptance

- Three genuine projects: TramTrace, Skylabs and Dual USB-C. The last uses the
  supplied installed-in-laptop overview. Each has its existing real macro.
- Readable identity and real work in the opening viewport, dark-base text
  contrast, named project tabs, one selected tab and one exposed project panel.
- Card selection, Previous/Next cycling, Arrow/Home/End navigation, overview and
  close-up changes, repeated selection without redundant history entries.
- Project/view URLs preserve unrelated query parameters and fragments. Shared
  detail URLs, reload and native Back/Forward restore the intended state.
- Real pointer dragging and native mobile touch swipes work in both directions.
  A small drag and cancelled contact do not select another project. Vertical
  touch movement scrolls the page rather than navigating the deck.
- Delayed photos cannot replace newer or reversed selections. A failed source
  retains case-study access and retry restores the requested genuine source.
- Save Data does not prefetch unselected macros. No-JavaScript and failed-folio
  controller states retain all three source photos and real case links.
- The optional local text-animation module can fail without hiding copy or
  blocking selection. Narrow and short viewports retain useful controls.

## Registered copper comparison

TramTrace's copper mode uses the original front-copper, front-mask and front-silk
SVG family. Both compositions retain the exact `0 0 223.7486 111.1758` frame.
The test checks the four embedded source references, identical image placement
and unchanged coordinate transforms. It does not imply a photograph is
geometrically registered to the board artwork; the two compositions are the
registered source-vector views.

Browser coverage checks matching drawing bounds, native range keys and endpoints,
readout/ARIA/CSS agreement, Reset, pointer scrubbing and real mobile touch dragging.
Keyboard input must not switch the parent project. The comparison works with
WebGL denied. Copper is unavailable for other projects; invalid copper deep links
normalize the displayed mode. History returns to the comparison correctly.

A source-layer failure disables the range, exposes Retry and keeps the full
copper/data case-study link. Retry must restore the actual composition. Without
JavaScript or the comparison controller, the two source compositions remain
readable side by side and unusable controls stay hidden.

## Preserved behavior

All existing expanded-photograph checks remain: largest supplied image candidate,
bounded zoom, keyboard and pointer pan, focus containment, Escape, focus/scroll
restoration, retry and changed-project reopening. Native mobile touch coverage
retains the fresh Close baseline, real pinch/pan, exact Reset/plus/minus taps,
another pinch/pan, and the strict final `Close.tap()` dismissal. Dragging away and
back, cancellation and a second contact must not activate Close.

Existing case-study photo dialogs, collection search/query/category/reset/history,
shared routes, public CV, Files, Book and all narrow interiors remain covered.
TramTrace's separate production workbench still checks five electrical chains,
116 pixels, ten component groups, 24-bit frames at 800 kbit/s, components, copper,
rotation, scrub/play/pause/replay/interruption and offscreen pause without resume.

The deferred aircraft is approached before testing its renderer. Actual desktop
and mobile aircraft/telemetry destination checks require new WebGL frames,
153 telemetry components and exact assembly alignment; a poster fallback cannot
pass them. Aircraft copy is checked against its new subordinate heading and
Skylabs identity, with the same viewport/header/navigation bounds. No-JavaScript,
reduced motion, Save Data, short viewports, denied WebGL, controller failure and
model failure retain their independent fallback checks. The approved two chapters
and separate peel/rigid-clearance geometry suites are unchanged.

## Review artifacts

The suite captures 1440×900 and 390×844 landing views, fully loaded full pages,
each selected project and real macro, mobile close-up, expanded desktop/mobile
photographs, copper at 15/50/85 percent on both sizes, and actual desktop/mobile
aircraft and telemetry endpoints. Existing collection/workbench/interior images
remain available.

Full-page preparation scrolls meaningful visible photographs through their real
lazy-loading path, waits for load/decode/nonzero natural dimensions, records
sources and restores the original scroll. It never forces eager loading. Hidden
alternative states are excluded. Modal failures use viewport screenshots because
background content is inert. Missing meaningful photos fail capture.

Navigation/resource timings and renderer frame/readiness observations are local
CI diagnostics, not physical-phone/network benchmarks or synthetic scores.

## Current verification

Six source groups, JavaScript syntax, whitespace validation and the structural
v3 audit pass against the assembled folio. Browser acceptance for this new
presentation is pending the first isolated review-branch run. Prior landing
results do not count as a pass for this design. Local Chromium still fails before
opening a page with `socket() failed: Operation not permitted`; CI is the browser
execution route for this review.
