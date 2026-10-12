# Clearer v2 navigation

The homepage uses the existing CAD scenes as scroll-reactive accompaniment to
ordinary document content. Work, About, CV and Contact are the primary routes;
each featured project has one stable text link. Detailed project pages retain
their existing interactive viewers. The shared scene controllers opt into the
new presentation only through homepage data attributes.

## Content and accessibility

- The hero is approximately one viewport, with a concise introduction and a
  single project-catalog link. It does not require a chapter selection.
- Framework and transport project entries remain in normal flow at every
  animation pose. Their links are never made inert or hidden by chapter state.
- Skylabs has two real article anchors and one project link. Existing
  `work-framework`, `work-transit`, `skylabs-aircraft` and `skylabs-telemetry`
  hashes continue to point to readable content.
- Canvas/poster artwork is decorative and pointer-transparent. Native wheel,
  touch, keyboard and link navigation remain browser-owned.
- Reduced motion, short viewports, Save Data, no JavaScript and unavailable
  WebGL retain the project entries and static imagery without an empty runway.
- Content-only reflow updates Selected's geometry through a size-change-checked
  observer. Skylabs measures its actual article origin on native scroll, so
  upstream content growth cannot leave a stale scroll mapping.

## Preparation and rendering

The three existing renderers retain their owned, cancelable GPU fences and
latest-target drawing. No models, textures, mesh detail, settled shadows or
project-view controls are removed. Root/v3 keep their existing presentation.

The shorter hero makes Selected geometrically near at page load. Automatic
offscreen proximity therefore keeps the hero's raw-transfer priority and waits
for its current visible composition to complete before secondary GPU work.
Actual visible entry or explicit project-section intent promotes preparation.
Hero exit also releases waiting work. Installation counts alone are not a
foreground completion signal. Completed stages are reused on return, and
settled or offscreen scenes do not run perpetual animation loops.

## Validation

`.github/workflows/verify-v2-navigation.yml` runs source/generator audits, actual
desktop and 320/390 px WebGL navigation, static fallbacks, route/CV checks,
mock-only booking, held-fence lifecycle/reflow cases and the existing v3 browser
regressions. It also measures matched 15-second cold initial-load windows and
separate native section-entry phases against commit `649bc32` under the same
10 Mbps/40 ms fixture. Report first CAD, complete hero, tasks and input separately;
layout changes can alter preparation timing and do not imply a speed improvement.

Screenshots require the requested article's actual destination geometry, a
current-size/current-pose completed draw and finished poster fades. A dataset
that still describes the previous completed pose is not a settled destination.

CI uses Chromium SwiftShader. Its timings and emulated mobile coverage do not
establish physical-device frame rate, field Core Web Vitals or perceived scroll
smoothness. Booking validation never submits to the real endpoint.
