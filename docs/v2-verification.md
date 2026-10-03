# V2 verification — 3 October 2026

The refreshed `/v2/` contains 25 HTML documents and 15 primary projects, including Coaster, Framework Logic Analyser and Tamagotchi SD Card. The three standalone browser tools keep their URLs but are excluded from the project collection and case-study navigation. Twenty-three indexable v2 routes are in the sitemap.

## Implemented

- A fullscreen, native-scroll assembly scene with TramTrace, Skylabs telemetry and the RP2354B card. Each uses the actual board geometry and named components.
- A charcoal gallery theme with soft white typography, pale blue links, and original photography providing the colour and detail. The hero leads with TramTrace, then Skylabs telemetry and Pi.
- Project-name headings and useful engineering facts in place of provenance captions, numbering and decorative slogans.
- A dedicated Pi case study and inspector: 33 physical component groups, exact USB-C connector and aligned reference housing, varied assembly separation, hover/tap identification and keyboard controls.
- Existing project pages and interactive tools retained; search includes all four Framework cards.
- Seven shared board assemblies across the electronics collection, plus the main Skylabs board-switching instance. Metroboard preserves all 291 authored LED placements in small spatial groups with individual hover identities.
- All 13 standalone v2 assembly viewers use one Disassemble/Assemble action and a compact top-right hover/tap readout, with consistent control styling. Preset rows, component directories, sliders and selection dropdowns are removed. TramTrace has one 3D viewer; Coaster's drink simulation sits outside its assembly toolbar. Camera framing accounts for separated connectors and enclosures on desktop and phones.
- Inspectors load automatically within 400 px of the viewport, keep a preview until rendering and offer retry on failure. Automatic loading neither steals keyboard focus nor enables scroll-driven motion; reduced-motion users retain the same controls.
- Skylabs telemetry and ground station use blue solder mask in all shared inspectors, posters and the telemetry hero. Component substrates and other materials retain their original colours.
- The homepage scroll scene starts with lightweight moving posters while the three CAD assemblies load independently. A slow or failed assembly keeps its own poster, without blocking the others. The existing Dual USB-C staged animation is retained.
- Hero CAD now uses lossless prepared assets, retaining all 370,334 triangles, material settings and original SVG silkscreens. Component motion adds staggered clearance, curved separation and independent tilts; a fitted 2048-pixel shadow map adds real component shadows. The original factories remain a per-model recovery path. Cold-cache all-model readiness improved from 25.50 s to 5.75 s in the controlled software-rendering comparison described in `docs/v2-hero-performance.md`.

## Verification

- `scripts/audit-v2.py`: document landmarks, metadata, project inventory, local assets, navigation and fragments; also checks hero pack hashes, compressed/plain equality and source freshness. Runs in GitHub Pages CI before artifact upload.
- `scripts/build-v2-hero-assets.cjs --verify`: exact parity between freshly evaluated source factories and reconstructed hero packs, including expanded triangle bytes, transforms, material/texture settings, metadata and motion origins.
- `scripts/verify-v2-hero-choreography.cjs`: component-family and spatial stagger, clearance before drift/tilt, curved trajectories, bounded deviation and exact reversible poses.
- `scripts/profile-v2-hero.cjs`: comparable cold-cache readiness, compression-aware transfer sizes, long tasks and geometry counts, with an assertion against silent source fallback.
- `scripts/verify-v2-browser.cjs`: homepage loading/menu/keyboard, 15 primary projects without tools, four Framework search results, filter and URL persistence, existing ESP32/Dual USB-C/Skylabs/TramTrace controls, no-JavaScript navigation, failed-model fallback and initial reduced motion.
- `scripts/verify-v2-autoload.cjs`: all three inspector engines load near the viewport without clicks, retain keyboard focus, stop rendering when idle/offscreen, support reduced motion and Save Data, retry after a failed model and work without IntersectionObserver.
- `scripts/verify-v2-hero-loading.cjs`: posters respond to scrolling before Three.js arrives; two CAD models render while the third is delayed; late models adopt the current chapter; partial failure and context loss retain working posters.
- `scripts/verify-v2-navigation.cjs`: normal desktop navigation and a 6.5-second late shared controller on desktop and mobile reduced motion; the destination paints before the controller arrives without a rejected cross-document transition.
- `scripts/verify-hardware-catalog.cjs`: shared assembly views, varied reversible part transforms, physical hover/tap, keyboard controls, stable idle rendering, offscreen pause, mobile overflow, reduced motion, context loss, failed-model and no-JavaScript fallbacks.
- `scripts/verify-v2-motion.cjs`: each hero chapter at desktop, laptop, tablet and phone widths; project controls/links, stable idle rendering, offscreen pause, live reduced motion and context-loss fallback.
- `scripts/verify-v2-cad-motion.cjs`: physical components move through finite intermediate poses and return to their initial positions and orientations on reverse scrolling. Checks telemetry reference coverage, distinct separation distances and tilts, and desktop/mobile framing.
- `scripts/verify-v2-part-motion.cjs`: deterministic stagger, different heights within a component family, lateral movement, tilt, underside direction and exact pose recovery after repeated reversals.
- `scripts/verify-v2-skylabs.cjs`: repeated board switching and material rendering, query persistence, hover labels, stale asynchronous loads, nested anchors, mobile controls, context loss and no-JavaScript navigation.
- `scripts/verify-framework-pi.cjs`: automatic loading, varied separation and exact reassembly, keyboard, physical hover/tap labels, housing, idle/offscreen behaviour, mobile, reduced motion and model/context failure recovery.
- `scripts/verify-v2-legacy-assemblies.cjs`: simplified ESP32, Dual USB-C and TramTrace controls, component picking, staged assembly motion, desktop/mobile geometry framing and demand rendering. TramTrace uses the hero's dark board finish and source silkscreen in v2.
- `scripts/verify-v2-coaster.cjs`: one assembly action, varied separation and exact reassembly, physical component identities, mobile interaction and the separate drink simulation.
- `scripts/verify-v2-theme.cjs`: 23 routes at 1440 and 390 px, checking text/control contrast, dark page surfaces, menus and horizontal overflow; includes both teaching applications and their alternate modes. Scientific plotting canvases retain their original white backgrounds.
- The retained content routes were reviewed at 1440 and 390 px. Search and category coverage includes all 15 projects. Skylabs uses the shared CAD controls, with one board-switching inspector on the main page and curated hover names on all three pages.
- Visual review included all three hero chapters and the introduction at 1440×1000, 1366×768, 768×1024, 390×844 and 320×740. Models, captions and selectors fit; the narrow-phone introduction was reduced slightly to leave more room around navigation.

Telemetry retains all 153 physical references in 54 moving hero groups. Its nearby resistors and capacitors are batched while retaining every exported reference and its geometry. The hero uses 33 Pi groups and 31 TramTrace groups, including small LED cohorts. Source component geometry is preserved; repeated CAD surfaces are batched by material. Per-reference motion varies start time, separation height, lateral movement and rotation. Rendering stops when idle or hidden.

Original Pi board, enclosure and switch-library hashes were checked after export. Both switch STEP models are registered to their authored WRL coordinate frame; all eight terminals overlap their corresponding pads. The Pi poster is a transparent 1600×1200 WebP. Rebuild steps and numeric registration checks are in `docs/framework-pi.md`.

Logic Analyser has 42 modeled groups, with the rear socket aligned to its authored WRL and the USB plug centred on the board midplane. Its unspecified pogo-contact footprint remains bare. LoRa has 40 physical groups, including registered HRO USB and u-blox NEO CAD; the Renata holder uses a documented dimensional representation for its envelope and solder tabs. Both revised inspectors passed controls, exact explosion reversal, mobile, reduced motion, idle/offscreen and failure-recovery checks.

Skylabs telemetry v4.0 and ground station v1.0 were rebuilt from the supplied Mission Systems directory. USB boss alignment, telemetry Q4 population and the backside Renata holder were checked against the source footprints. Lossless primitive batching reduces the GLBs to approximately 8.53 MB and 2.98 MB while verifying the expanded triangle stream. The holder remains an explicitly documented dimensional representation.

The seven retained PCB source hashes remain unchanged. Final poster captures use the same factory, geometry and materials as the live inspectors. Build and model-coverage details are in `docs/hardware-catalog.md` and `assets/models/hardware/README.md`.

Temporary browser captures and QA scripts remain in ignored `.codex-temp/`. The unrelated `brag-series/` directory is excluded from release staging. Deployment success and public release verification are checked separately after push.
