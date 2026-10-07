# Skylabs aircraft in v2

The aircraft story follows Selected work and precedes About. The existing opening
three-project animation and its `#work` destination stay intact. The story uses
the same aircraft geometry, film peel, cloud fade and telemetry extraction as v3;
its chapter anchors are namespaced to `#skylabs-aircraft`, `#skylabs-inside` and
`#skylabs-telemetry`.

The section defers aircraft-specific code and model requests until it is near
view. Its entry landing starts when the section is entered, rather than being
consumed by scrolling the original hero or gallery. The telemetry transport is
shared with the opening hero. Both scenes suspend drawing when offscreen.

## Focused acceptance

Run `node scripts/verify-v2-aircraft.cjs` with the local site served on port 8080
and Playwright available. `V2_BASE_URL`, `V2_AIRCRAFT_OUT`, and
`CHROMIUM_EXECUTABLE` can override defaults. `--static-only` and `--scene-only`
select bounded subsets. Evidence and desktop/mobile screenshots are written to
`.codex-temp/v2-aircraft/`; they are not shipped to the website.

The checks cover source preservation, deferred network requests, entry autoplay,
one telemetry download shared by both scenes, cloud fade and reverse, idle and
offscreen suspension, native chapter links and direct hashes, mobile layout,
reduced motion, no-JavaScript fallback, and a standalone v3 regression smoke.

Validation result: 8 October 2026 — 6 focused groups passed, including static
fallbacks, the deferred desktop entry, aircraft/telemetry reuse, cloud fade and
reverse, offscreen suspension, mobile chapter navigation, and the standalone v3
regression smoke. The broader v2 and v3 audits also pass.
