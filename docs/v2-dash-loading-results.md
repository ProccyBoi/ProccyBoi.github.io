# v2 Dash and loading update — 28 October 2026

The first screen now uses the full Dash device assembly beside TramTrace and the Raspberry Pi card. The homepage keeps a quick three-project overview and replaces the large demo shelf with three compact links to real hardware. Dash's case study contains one device viewer and a short explanation. The duplicate Kiku feature has been removed.

The offscreen aircraft previously downloaded its full geometry during initial page loading. Its source helpers and geometry now wait until the section is near the viewport or explicitly requested. Hero startup does not run for a direct overview fragment until the visitor returns toward it. Static posters remain visible while CAD loads. The optional canvas loading effect is no longer mounted on v2's homepage.

The new Dash pack is lossless and contains the same source device geometry and assembly motion. The OLED uses a tiny captured idle frame, without loading a live character controller. Existing aircraft and other-version assets remain available.

## Controlled browser comparison

Three samples per version, 1440 × 900 viewport, cold/no-store resources, shared 10 Mbps local-origin bandwidth plus 40 ms/request. Baseline: `df85853`. No scrolling during each 20-second capture. Full samples and measurement definitions are in [v2-dash-loading-results.json](v2-dash-loading-results.json).

| Median metric (milliseconds or bytes as named) | Baseline | Updated |
| --- | ---: | ---: |
| firstCAD | 5002 | 3893 |
| allCAD | 6113 | 4795 |
| FCP | 1248 | 1012 |
| maxLongTask | 446 | 687 |
| blocking | 1722 | 1572 |
| requests | 46 | 33 |
| bodyBytes | 9576488 | 3066141 |
| modelBytes | 8042955 | 2162176 |

Initial resource body download decreased by about 68% (9.58 MB → 3.07 MB). Median readiness for all three hero models improved by about 22% (6.11 s → 4.80 s).

Graphics timing remains variable: the updated samples took 4.49, 9.29 and 4.80 seconds to ready all three models. The middle sample had a 3.215-second long task. Median longest task increased from 446 to 687 ms; these changes do not establish uniformly smoother graphics or guarantee a particular device's loading time. The main stable improvement is avoiding distant model downloads and shrinking initial transfer.

## Validation

Source suites cover proximity gating, deferred scripts, hero startup, pacing, prefetch textures, choreography, handoffs and aircraft pacing. Generated v2 links/assets/fragments and the other version structure checks passed. Browser inspection through CUA covers desktop and mobile hero layouts, mobile navigation, the compact Explore section and Dash assembly/reassembly. Full legacy CLI browser acceptance suites were updated where necessary but were not run during this CUA-only session.

A subsequent browser check found and corrected an initial fragment-scroll race: fresh navigation to `#overview` could start the hero before native scrolling settled. After the fix, a fresh controlled-browser visit positioned the overview at 100 px beneath the header, never started the hero, and downloaded no Dash, TramTrace or aircraft geometry across 20 seconds. Nearby Framework model preparation still occurred (3.28 MB total resource bodies). The three top-of-page benchmark samples above predate this small fragment-restoration fix; they are retained as measured. The deferred aircraft also rendered successfully when opened directly, and its Skip animation link reached the next section.

The design was informed by ten engineer-owned personal/project sites. A linked reference review accompanies the user-facing delivery. It examines content and navigation, rather than claiming a screenshot study or measuring those sites.

