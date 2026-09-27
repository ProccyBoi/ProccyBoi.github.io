# V2 verification — 27 September 2026

The refreshed `/v2/` contains 22 HTML documents and fifteen primary projects: the original v2 collection plus the Raspberry Pi expansion card. The separately maintained Coaster project remains on the original site. Twenty indexable v2 routes are in the sitemap.

## Implemented

- A fullscreen, native-scroll assembly scene with the ESP32 card, RP2354B card and TramTrace. Each uses the actual board geometry and named components.
- An original light gallery theme with restrained typography, blue links, and hardware providing the colour and detail.
- Project-name headings and useful engineering facts in place of provenance captions, numbering and decorative slogans.
- A dedicated Pi case study and inspector: 33 component groups, exact USB-C connector, aligned reference housing, camera presets, assembly separation, part selection and keyboard controls.
- Existing project pages and interactive tools retained; search includes all three Framework cards.

## Verification

- `scripts/audit-v2.py`: document landmarks, metadata, project inventory, local assets, navigation and fragments. Runs in GitHub Pages CI before artifact upload.
- `scripts/verify-v2-browser.cjs`: homepage loading/menu/keyboard, fifteen primary projects, three Framework search results, filter and URL persistence, existing ESP32/Dual USB-C/Skylabs/TramTrace controls, no-JavaScript navigation, failed-model fallback and initial reduced motion.
- `scripts/verify-v2-motion.cjs`: each hero chapter at desktop, laptop, tablet and phone widths; project controls/links, stable idle rendering, offscreen pause, live reduced motion and context-loss fallback.
- `scripts/verify-v2-cad-motion.cjs`: actual physical components move through finite intermediate poses and return to their initial positions on reverse scrolling. Tests the ESP32’s 18 moving groups, Pi’s 33 and TramTrace’s 28, including its 116-LED bank.
- `scripts/verify-framework-pi.cjs`: on-demand load, all component groups, explode/reassemble, presets, keyboard, component labels, housing, idle/offscreen behaviour, mobile, reduced motion and model/context failure recovery.
- All nineteen content routes below the homepage were opened at 1440 and 390 px: no JavaScript errors, failed HTTP resources or document horizontal overflow.
- Visual review included all three hero chapters and the introduction at 1440×800, 1366×768, 390×844 and 320×700. Models, captions and selectors fit; the narrow-phone introduction was reduced slightly to leave more room around navigation.

The optimized hero uses 49 draw calls for the ESP32 model, 87 for Pi and 83 for TramTrace, plus one soft shadow per visible project. The standalone Pi assembly uses 89 draw calls. Source component geometry is preserved; repeated CAD surfaces are batched by material. Rendering stops when idle or hidden.

Original Pi board and enclosure hashes were checked after export. The Pi poster is a verified transparent 1600×1200 WebP (62,266 bytes). Rebuild steps and model transforms are in `docs/framework-pi.md`.

Temporary browser captures and QA scripts remain in ignored `.codex-temp/`. The unrelated `brag-series/` directory is excluded from release staging. Deployment success and public release verification are checked separately after push.
