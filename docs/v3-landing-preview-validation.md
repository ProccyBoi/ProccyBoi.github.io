# Dark landing preview validation

## Scope

This is a landing-page preview for review. The changes do not authorize publishing
it over the live portfolio. The root site, v2, v3 interiors and accepted aircraft
controller/geometry remain outside this presentation change.

The landing restores the actual shared v2 charcoal palette, Archivo typography,
three-project photo gallery, smaller project cards, About and Contact sections.
The shorter aircraft introduction gives the name, electrical-engineering student
role and UNSW/Sydney location. The header has Projects, About and Contact; Files,
Book and the public CV remain in the footer. The previous signal-path/evidence
and teaching-tool showcase sections are absent.

The existing 15-project collection, 23 interiors, case-study photo lightboxes and
in-page TramTrace copper/data workbench remain covered by the portfolio suite.
Teaching tools retain their routes and the original site's project-index links;
Flight Review retains its Skylabs case-study links. They are no longer required
to be showcased on this preview's homepage.

## Commands and artifacts

```sh
python scripts/build-v3-pages.py --check
python scripts/audit-v3.py
node scripts/verify-v3-portfolio.cjs --static-only
python -m http.server 8080 --bind 127.0.0.1
# In another terminal with Playwright available:
V3_SCREENSHOTS=.codex-temp/v3-landing-preview node scripts/verify-v3-portfolio.cjs
```

`V3_BASE_URL` accepts a preview origin or its `/v3/` URL.
`CHROMIUM_EXECUTABLE` is optional; omit it to use Playwright's bundled browser.
The suite writes detailed `results.json`, screenshot evidence and per-failure
request/error records. A browser launch failure is reported as blocked and
returns a nonzero exit code. Source checks do not imply a browser pass.

The review artifact includes:

- Desktop landing viewport and fully loaded full page
- The gallery overview and all three genuine detail photographs
- Mobile full page and selected detail view
- Expanded hardware photographs at desktop and mobile sizes
- Actual rendered aircraft stopped and telemetry poses at desktop and 390×844
- Existing collection, case-study, copper/data and responsive diagnostic views

Before a full-page capture, meaningful rendered images are scrolled into view
and their real native-lazy or `data-gallery-src`/`data-v3-src` loading path is
allowed to run. Loading attributes are not changed by the test. The test waits
for load, decode and nonzero natural dimensions, records the source and
resolution, and restores the previous scroll position. Hidden alternate states
are excluded. A photograph that should be visible but cannot load fails capture.

## Landing acceptance

The static contract requires the shared `v2.css` and `v2-gallery.css`, plus the
preview-specific `v3-landing.css`. It rejects loading the warm interior `v3.css`
on the landing. A browser test checks the actual computed body background,
foreground, Archivo body/heading typography and exact v2 color tokens, including
the vermilion accent. The absence of the former assignment-style sections and
Tools header link is also checked.

The gallery is the shared v2 implementation with these real sources:

| Selected project | Overview | Detail |
| --- | --- | --- |
| TramTrace | `tramtrace-hero` | `tramtrace-controller` |
| Skylabs | `skylabs-telemetry-hero` | `skylabs-telemetry-macro` |
| Dual USB-C | `framework-dual-hero` | `framework-dual-ports` |

Checks cover every project and macro, one settled visible photograph, matching
project copy/link state, Arrow/Home/End keyboard selection, repeated selection,
query/hash preservation, reload, shared detail links and real Back/Forward.
A delayed detail response must not replace a newer selection. Failed overviews
retain a useful project link and retry; a missing optional macro falls back to
its correct overview. No-JavaScript and failed-controller cases retain native
photographs and links. Save Data avoids unselected macro downloads. Narrow and
short viewports retain accessible controls without page overflow.

## Expanded photograph acceptance

The v3-only enhancement opens the selected supplied photograph in a native modal.
Tests verify that the largest existing source candidate is used, rather than an
invented image URL or a replacement render. They cover:

- Ready/loading/error states and successful decoding
- Keyboard and button zoom bounded from 1× to 3×
- Keyboard pan, real pointer dragging, reset and repeated opening
- Native two-contact touch pinch and one-finger pan in a mobile context
- Forward and reverse Tab containment, Escape/Close dismissal, focus restoration
  and unchanged page URL/scroll position
- Reopening and switching projects without carrying stale photo/pan/zoom state
- Failed full-size image, disabled zoom while unavailable, retry and a subsequent
  different project's photograph

Desktop and mobile screenshots show the expanded real macro, not a placeholder.

## Preserved regression coverage

All prior aircraft real-WebGL checks remain. A normal-preference run must render
an actual frame and all 153 telemetry components; a successful poster fallback
cannot count as a renderer pass. Desktop and mobile destination navigation waits
for new frames and complete poses, then checks visible copy and overflow. The
approved two-destination sequence, absence of an Anatomy chapter/numbered
overlay, and existing renderer-free peel/rigid-clearance suites remain intact.

The TramTrace tests still verify 116 distinct pixels in five electrical chains,
24-bit color at 800 kbit/s, ten component groups, fabrication layers, component
selection, rotation, every chain's range/readouts, playback interruptions,
offscreen pause without automatic resume and denied-WebGL 2D operation.
Existing case-study dialog and all-interior narrow-layout checks are retained.

Diagnostic Navigation/Resource Timing measurements remain in the results for the
desktop home and actual renderer. These are local CI observations, not a physical
phone/network benchmark or a synthetic performance score.

## Verification status

At authoring time, JavaScript syntax, whitespace checks and all five source-check
groups pass against the new landing. Live browser acceptance for this revision
still requires the isolated review-branch CI run. Local Chromium remains blocked
before opening a page by `socket() failed: Operation not permitted`.

The unchanged interior Tools links point to `/projects/#interactive`, not to a
removed landing section. The original public tools index remains available; no
interior navigation change is needed for this preview.
