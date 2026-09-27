# V2 verification — 27 September 2026

The refreshed `/v2/` contains 25 HTML documents and 18 primary projects, including Coaster, Framework Logic Analyser and Tamagotchi SD Card. Twenty-three indexable v2 routes are in the sitemap.

## Implemented

- A fullscreen, native-scroll assembly scene with TramTrace, the ESP32 card and the RP2354B card. Each uses the actual board geometry and named components.
- A charcoal gallery theme with soft white typography, pale blue links, and original photography providing the colour and detail. The hero leads with TramTrace, then ESP32 and Pi.
- Project-name headings and useful engineering facts in place of provenance captions, numbering and decorative slogans.
- A dedicated Pi case study and inspector: 33 component groups, exact USB-C connector, aligned reference housing, camera presets, assembly separation, part selection and keyboard controls.
- Existing project pages and interactive tools retained; search includes all four Framework cards.
- Seven shared assembly views across the electronics collection. Metroboard preserves all 291 authored LED placements as a single selectable bank.

## Verification

- `scripts/audit-v2.py`: document landmarks, metadata, project inventory, local assets, navigation and fragments. Runs in GitHub Pages CI before artifact upload.
- `scripts/verify-v2-browser.cjs`: homepage loading/menu/keyboard, 18 primary projects, four Framework search results, filter and URL persistence, existing ESP32/Dual USB-C/Skylabs/TramTrace controls, no-JavaScript navigation, failed-model fallback and initial reduced motion.
- `scripts/verify-hardware-catalog.cjs`: all seven shared assembly views, reversible part transforms, component selection, camera and keyboard controls, stable idle rendering, offscreen pause, mobile overflow, reduced motion, context loss, failed-model and no-JavaScript fallbacks.
- `scripts/verify-v2-motion.cjs`: each hero chapter at desktop, laptop, tablet and phone widths; project controls/links, stable idle rendering, offscreen pause, live reduced motion and context-loss fallback.
- `scripts/verify-v2-cad-motion.cjs`: actual physical components move through finite intermediate poses and return to their initial positions on reverse scrolling. Tests the ESP32’s 18 moving groups, Pi’s 33 and TramTrace’s 28, including its 116-LED bank.
- `scripts/verify-framework-pi.cjs`: on-demand load, all component groups, explode/reassemble, presets, keyboard, component labels, housing, idle/offscreen behaviour, mobile, reduced motion and model/context failure recovery.
- `scripts/verify-v2-theme.cjs`: 23 routes at 1440 and 390 px, checking text/control contrast, dark page surfaces, menus and horizontal overflow; includes both teaching applications and their alternate modes. Scientific plotting canvases retain their original white backgrounds.
- The retained content routes were reviewed at 1440 and 390 px. Search and category coverage includes all 18 projects. Nested Skylabs maps preserve component selection and annotations alongside the new assemblies.
- Visual review included all three hero chapters and the introduction at 1440×1000, 1366×768, 768×1024, 390×844 and 320×740. Models, captions and selectors fit; the narrow-phone introduction was reduced slightly to leave more room around navigation.

The optimized hero uses 49 draw calls for the ESP32 model, 87 for Pi and 83 for TramTrace, plus one soft shadow per visible project. The standalone Pi assembly uses 89 draw calls. Source component geometry is preserved; repeated CAD surfaces are batched by material. Rendering stops when idle or hidden.

Original Pi board, enclosure and switch-library hashes were checked after export. Both switch STEP models are registered to their authored WRL coordinate frame; all eight terminals overlap their corresponding pads. The Pi poster is a transparent 1600×1200 WebP. Rebuild steps and numeric registration checks are in `docs/framework-pi.md`.

Logic Analyser has 42 modeled groups, with the rear socket aligned to its authored WRL and the USB plug centred on the board midplane. Its unspecified pogo-contact footprint remains bare. LoRa has 40 physical groups, including registered HRO USB and u-blox NEO CAD; the Renata holder uses a documented dimensional representation for its envelope and solder tabs. Both revised inspectors passed controls, exact explosion reversal, mobile, reduced motion, idle/offscreen and failure-recovery checks.

The seven retained PCB source hashes remain unchanged. Final poster captures use the same factory, geometry and materials as the live inspectors. Build and model-coverage details are in `docs/hardware-catalog.md` and `assets/models/hardware/README.md`.

Temporary browser captures and QA scripts remain in ignored `.codex-temp/`. The unrelated `brag-series/` directory is excluded from release staging. Deployment success and public release verification are checked separately after push.
