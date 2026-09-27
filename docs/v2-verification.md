# V2 verification — 27 September 2026

The refreshed `/v2/` contains 25 HTML documents and 15 primary projects, including Coaster, Framework Logic Analyser and Tamagotchi SD Card. The three standalone browser tools keep their URLs but are excluded from the project collection and case-study navigation. Twenty-three indexable v2 routes are in the sitemap.

## Implemented

- A fullscreen, native-scroll assembly scene with TramTrace, Skylabs telemetry and the RP2354B card. Each uses the actual board geometry and named components.
- A charcoal gallery theme with soft white typography, pale blue links, and original photography providing the colour and detail. The hero leads with TramTrace, then Skylabs telemetry and Pi.
- Project-name headings and useful engineering facts in place of provenance captions, numbering and decorative slogans.
- A dedicated Pi case study and inspector: 33 component groups, exact USB-C connector, aligned reference housing, camera presets, assembly separation, part selection and keyboard controls.
- Existing project pages and interactive tools retained; search includes all four Framework cards.
- Seven shared assembly views across the electronics collection. Metroboard preserves all 291 authored LED placements as a single selectable bank.
- Inspectors load automatically within 400 px of the viewport, keep a preview until rendering and offer retry on failure. Automatic loading neither steals keyboard focus nor enables scroll-driven motion; reduced-motion users retain the same controls.
- Skylabs telemetry and ground station use blue solder mask in all shared inspectors, posters and the telemetry hero. Component substrates and other materials retain their original colours.
- The homepage scroll scene starts with lightweight moving posters while the three CAD assemblies load independently. A slow or failed assembly keeps its own poster, without blocking the others. The existing Dual USB-C staged animation is retained.

## Verification

- `scripts/audit-v2.py`: document landmarks, metadata, project inventory, local assets, navigation and fragments. Runs in GitHub Pages CI before artifact upload.
- `scripts/verify-v2-browser.cjs`: homepage loading/menu/keyboard, 15 primary projects without tools, four Framework search results, filter and URL persistence, existing ESP32/Dual USB-C/Skylabs/TramTrace controls, no-JavaScript navigation, failed-model fallback and initial reduced motion.
- `scripts/verify-v2-autoload.cjs`: all three inspector engines load near the viewport without clicks, retain keyboard focus, stop rendering when idle/offscreen, support reduced motion and Save Data, retry after a failed model and work without IntersectionObserver.
- `scripts/verify-v2-hero-loading.cjs`: posters respond to scrolling before Three.js arrives; two CAD models render while the third is delayed; late models adopt the current chapter; partial failure and context loss retain working posters.
- `scripts/verify-v2-navigation.cjs`: normal desktop navigation and a 6.5-second late shared controller on desktop and mobile reduced motion; the destination paints before the controller arrives without a rejected cross-document transition.
- `scripts/verify-hardware-catalog.cjs`: all seven shared assembly views, reversible part transforms, component selection, camera and keyboard controls, stable idle rendering, offscreen pause, mobile overflow, reduced motion, context loss, failed-model and no-JavaScript fallbacks.
- `scripts/verify-v2-motion.cjs`: each hero chapter at desktop, laptop, tablet and phone widths; project controls/links, stable idle rendering, offscreen pause, live reduced motion and context-loss fallback.
- `scripts/verify-v2-cad-motion.cjs`: actual physical components move through finite intermediate poses and return to their initial positions on reverse scrolling. Checks telemetry reference coverage after batching its passive parts, Pi’s 33 moving groups and TramTrace’s 28, including its 116-LED bank.
- `scripts/verify-v2-skylabs.cjs`: repeated board switching and material rendering, query persistence, component explanations and grouped selection, pre-load selection, stale asynchronous loads, nested anchors, mobile controls, context loss and no-JavaScript navigation.
- `scripts/verify-framework-pi.cjs`: automatic loading, all component groups, explode/reassemble, presets, keyboard, component labels, housing, idle/offscreen behaviour, mobile, reduced motion and model/context failure recovery.
- `scripts/verify-v2-theme.cjs`: 23 routes at 1440 and 390 px, checking text/control contrast, dark page surfaces, menus and horizontal overflow; includes both teaching applications and their alternate modes. Scientific plotting canvases retain their original white backgrounds.
- The retained content routes were reviewed at 1440 and 390 px. Search and category coverage includes all 15 projects. Skylabs uses the shared CAD controls, with one board-switching inspector on the main page and curated component explanations on all three pages.
- Visual review included all three hero chapters and the introduction at 1440×1000, 1366×768, 768×1024, 390×844 and 320×740. Models, captions and selectors fit; the narrow-phone introduction was reduced slightly to leave more room around navigation.

The optimized hero stays below 350 draw calls in each focused chapter. Telemetry has 153 physical references, rendered as 49 moving groups in the hero. Its resistors and capacitors sharing a displacement are batched while retaining every exported reference and its geometry; component meshes reduce from 403 to 141. Pi uses 87 draws and TramTrace 83, plus one soft shadow per visible project. The standalone Pi assembly uses 89 draw calls. Source component geometry is preserved; repeated CAD surfaces are batched by material. Rendering stops when idle or hidden.

Original Pi board, enclosure and switch-library hashes were checked after export. Both switch STEP models are registered to their authored WRL coordinate frame; all eight terminals overlap their corresponding pads. The Pi poster is a transparent 1600×1200 WebP. Rebuild steps and numeric registration checks are in `docs/framework-pi.md`.

Logic Analyser has 42 modeled groups, with the rear socket aligned to its authored WRL and the USB plug centred on the board midplane. Its unspecified pogo-contact footprint remains bare. LoRa has 40 physical groups, including registered HRO USB and u-blox NEO CAD; the Renata holder uses a documented dimensional representation for its envelope and solder tabs. Both revised inspectors passed controls, exact explosion reversal, mobile, reduced motion, idle/offscreen and failure-recovery checks.

Skylabs telemetry v4.0 and ground station v1.0 were rebuilt from the supplied Mission Systems directory. USB boss alignment, telemetry Q4 population and the backside Renata holder were checked against the source footprints. Lossless primitive batching reduces the GLBs to approximately 8.53 MB and 2.98 MB while verifying the expanded triangle stream. The holder remains an explicitly documented dimensional representation.

The seven retained PCB source hashes remain unchanged. Final poster captures use the same factory, geometry and materials as the live inspectors. Build and model-coverage details are in `docs/hardware-catalog.md` and `assets/models/hardware/README.md`.

Temporary browser captures and QA scripts remain in ignored `.codex-temp/`. The unrelated `brag-series/` directory is excluded from release staging. Deployment success and public release verification are checked separately after push.
