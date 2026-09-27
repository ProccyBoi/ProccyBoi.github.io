# V2 verification — 27 September 2026

The refreshed `/v2/` contains 29 HTML documents and 22 primary projects, including Coaster and six additional electronics projects. Twenty-seven indexable v2 routes are in the sitemap.

## Implemented

- A fullscreen, native-scroll assembly scene with the ESP32 card, RP2354B card and TramTrace. Each uses the actual board geometry and named components.
- An original light gallery theme with restrained typography, blue links, and hardware providing the colour and detail.
- Project-name headings and useful engineering facts in place of provenance captions, numbering and decorative slogans.
- A dedicated Pi case study and inspector: 33 component groups, exact USB-C connector, aligned reference housing, camera presets, assembly separation, part selection and keyboard controls.
- Existing project pages and interactive tools retained; search includes all four Framework cards.
- Thirteen new assembly views across the electronics collection, including the Kiku P2 enclosure and its separate populated board. Metroboard preserves all 291 authored LED placements as a single selectable bank. Notebook covers retain their bare reference artwork.
- A second homepage feature opens and closes Kiku's 14 physical groups through native scrolling, with explicit opt-in for reduced motion and Save Data.

## Verification

- `scripts/audit-v2.py`: document landmarks, metadata, project inventory, local assets, navigation and fragments. Runs in GitHub Pages CI before artifact upload.
- `scripts/verify-v2-browser.cjs`: homepage loading/menu/keyboard, 22 primary projects, four Framework search results, filter and URL persistence, existing ESP32/Dual USB-C/Skylabs/TramTrace controls, no-JavaScript navigation, failed-model fallback and initial reduced motion.
- `scripts/verify-hardware-catalog.cjs`: all thirteen new views, reversible part transforms, component selection, camera and keyboard controls, stable idle rendering, offscreen pause, mobile overflow, reduced motion, context loss, failed-model and no-JavaScript fallbacks.
- `scripts/verify-v2-product.cjs`: desktop/mobile Kiku choreography, reverse scrolling, lazy loading, native scrolling, reduced motion and Save Data.
- `scripts/verify-v2-motion.cjs`: each hero chapter at desktop, laptop, tablet and phone widths; project controls/links, stable idle rendering, offscreen pause, live reduced motion and context-loss fallback.
- `scripts/verify-v2-cad-motion.cjs`: actual physical components move through finite intermediate poses and return to their initial positions on reverse scrolling. Tests the ESP32’s 18 moving groups, Pi’s 33 and TramTrace’s 28, including its 116-LED bank.
- `scripts/verify-framework-pi.cjs`: on-demand load, all component groups, explode/reassemble, presets, keyboard, component labels, housing, idle/offscreen behaviour, mobile, reduced motion and model/context failure recovery.
- The previous release's nineteen content routes and this continuation's twelve affected case routes were reviewed at 1440 and 390 px. Search and category coverage includes all 22 projects. Nested Skylabs maps preserve component selection and annotations alongside the new assemblies.
- Visual review included all three hero chapters and the introduction at 1440×800, 1366×768, 390×844 and 320×700. Models, captions and selectors fit; the narrow-phone introduction was reduced slightly to leave more room around navigation.

The optimized hero uses 49 draw calls for the ESP32 model, 87 for Pi and 83 for TramTrace, plus one soft shadow per visible project. The standalone Pi assembly uses 89 draw calls. Source component geometry is preserved; repeated CAD surfaces are batched by material. Rendering stops when idle or hidden.

Original Pi board and enclosure hashes were checked after export. The Pi poster is a verified transparent 1600×1200 WebP (62,266 bytes). Rebuild steps and model transforms are in `docs/framework-pi.md`.

All twelve additional PCB source hashes and the Kiku mechanical source hashes remain unchanged. Kiku's product view uses 73 draw calls; its detailed PCB view uses 351. The other new assemblies range from 5 to 405. Final poster captures use the same factory, geometry and materials as the live inspectors. Build and model-coverage details are in `docs/hardware-catalog.md` and `assets/models/hardware/README.md`.

Temporary browser captures and QA scripts remain in ignored `.codex-temp/`. The unrelated `brag-series/` directory is excluded from release staging. Deployment success and public release verification are checked separately after push.
