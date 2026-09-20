# V2 completion evidence

Verified on 21 September 2026. The implementation is served from the repository root at `/v2/`. This document records the local acceptance checks; public deployment is verified separately against the GitHub Actions run and the served release URLs.

| Requested outcome | Current evidence |
| --- | --- |
| A separate new version under `/v2` | Homepage, project index, About and all case studies use `/v2/` routes and canonical metadata. Existing root pages and their assets were not edited. |
| New professional visual direction | Graphite, copper and mineral palette; self-hosted typography; product-scale CAD; responsive editorial cases. Desktop and mobile screenshots reviewed for home, collection, About and representative case/tool pages. |
| CAD renderings of actual PCBs as heroes | New 1600×1200 Framework and TramTrace WebPs, rendered from the existing GLBs with source silk. Source-derived Skylabs imagery also leads its case. Reproduction and exact provenance: `docs/v2-cad.md`. |
| No additional projects | Static audit compares the new collection with the existing collection: 14 of 14, with no added entries. The two Skylabs board pages remain subpages. |
| Improve existing projects | All fourteen case/tool routes have the v2 shell; case studies gain an editorial hierarchy, local section navigation, related-project paths and retained interactive evidence. Collection adds search, categories and persistent query URLs. |
| Thoughtful UI, UX and flow | Overview → selected work → system details → full case studies → contact. Keyboard/menu, system selection, model presets, search states, no-JavaScript content and reduced motion checked in a real browser. |
| Use design references | Apple MacBook Pro, Apple iPhone Air, Teenage Engineering OP–1 field and Linear features reviewed; applied decisions recorded in `docs/v2-design.md`. |

## Executed checks

- `python scripts/audit-v2.py`: **PASS**. 21 HTML pages, 14/14 existing projects, 100 images, 948 URL references, 139 fragments and 14 stylesheets. The two explicit exemptions are the internal CAD capture page and existing flight-review redirect. The same check now runs in the Pages workflow before artifact upload.
- `node scripts/verify-v2-browser.cjs`: **PASS**. Homepage reflow at 1440, 768, 390 and 320 px; mobile menu/Escape/focus; all system selections; on-demand CAD loading, preset/keyboard controls and no idle render loop; model-load failure fallback; search/empty state/category/URL persistence; no-JavaScript navigation; reduced motion.
- Integration checks: **PASS** for both Framework inspector controls, Skylabs aircraft/ground switching and v2 board links, and TramTrace copper/data views.
- All 18 content routes below the homepage (collection, About, fourteen projects, two Skylabs boards) opened at **1440 and 390 px**: no page JavaScript errors, failed HTTP resources or document horizontal overflow. The hardware inspection surfaces intentionally allow internal pan/zoom.
- New production JavaScript and render/verification scripts: `node --check` passed.
- CAD regeneration: source hashes unchanged, valid transparent WebPs; 61,462 bytes for Framework and 58,400 bytes for TramTrace. WebGL context-loss cleanup checked separately.
- Final homepage screenshots captured after scrolling through and decoding every image; no decode errors.
- Second-pass motion: `scripts/verify-v2-motion.cjs` checks the finite hero entrance, all three scroll-driven fabrication stages, direct/keyboard selection, idle state, mobile reflow, live reduced-motion changes and the no-JavaScript fallback. Controls and captions fit at 1440×800 and 1366×768; pinning turns off for windows below 651 px tall.
- CAD motion: `scripts/verify-v2-cad-motion.cjs` checks intermediate/final camera poses, shortest rotation paths, immediate input takeover, idle rendering shutdown, offscreen suspension, reduced motion and context loss.
- Targeted mobile checks also verified photograph-modal focus/Escape restoration and keyboard interaction with the MOSFET and lithography teaching controls.
- All 19 indexable v2 routes are included in `sitemap.xml`. Temporary QA output is ignored and excluded from release staging; the unrelated `brag-series/` working directory is not part of this release.

The original site remains available. The application remains plain HTML/CSS/JavaScript; Node/Playwright and Python/Pillow are development/verification tools only.
