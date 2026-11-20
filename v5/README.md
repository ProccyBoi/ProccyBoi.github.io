# V5 — Workbench

The `/v5/` portfolio covers 17 projects, two Skylabs board records, a searchable archive, About and a reference notebook. Its homepage opens on a four-project workbench index with direct links to the builds and their demos.

## Evidence and design

The [reference notebook](/v5/references/) records 12 creator resources, three dated social posts and five design decisions. Research was checked on 28 October 2026. Direct X reads were blocked; the specific post text was read in creator-linked/embedded articles. This is a source-led sample of the Japanese maker web with explicit X trails, not an exhaustive survey or popularity ranking.

The main sources are 74th's RP2040 alignment jig, ciniml's M5Stack reflow controller and STEP model combiner, Lang-ship's EasyEDA/OSHWLab workflow, CHIRIMEN, UniBoard SPICE, and Switch Science's historical reflow guide. International interaction references include Ciechanowski's Mechanical Watch, KiCanvas, InteractiveHtmlBom, Falstad and CPU Land. Sources and boundaries are linked individually in the notebook.

The composition uses cobalt media plates, paper, near-black rules and chartreuse active controls, with self-hosted Archivo and Plex Mono. `workbench.js` adds keyboard and pointer selection to the project index. With JavaScript disabled, all four plates and their links remain available.

W3C keyboard, reflow, focus visibility and motion guidance inform the implementation. The 320px surrounding layout, native links, visible focus, static reduced-motion presentation and skip route have explicit acceptance checks. MDN progressive enhancement and visibility tracking inform fallbacks and rendering lifecycle. Desktop tests are not screen-reader certification, physical-device frame-rate measurements or field Core Web Vitals data.

## Content and geometry

`build-pages.py` renders 20 interiors from the existing `v4/content/projects.json` evidence ledger and established public profile material. The V5-only tester record appears in the archive and opens its authored case study. Home and the notebook are also authored separately. Photos and CAD assets come from the existing site.

The Glitch Tester case mounts the shared 129-footprint inspector and virtual bench with draggable leads, a working supply switch and simulated fault LEDs. The Dash, Skylabs telemetry and Skylabs ground station cases mount the existing CAD assemblies with part identification and disassembly.

`flight.js` draws the track and barometric height change from 348 exact rows in the published F110211 replay, selected at roughly two-second intervals with endpoints and extrema included. The preview reports GNSS ground speed. Its source link opens the full Flight Review.

`assembly.js` loads the existing telemetry model and extracted CAD lands near the viewport. It preserves source triangles, component rotations and final placements. The camera and component reveal respond to native document scrolling. Paste volume, wetting and process timing are illustrative; this is not production stencil data, a measured reflow trace or a validated process recipe. Underside and through-hole parts appear in separate steps. Package-model limitations of the existing export remain; there was no new verification against a separate local board project.

`solder-process.js` adds an explanatory stencil and squeegee, an advancing paste front, rough raised deposits and smooth curved solder surfaces. Its aperture outlines follow the selected CAD lands. A wide view shows the printing tool before the camera closes in as the stencil lifts. It then holds the same exposed U14 lead bank from revealed paste through placement and wetting, so deposits are visible before components obscure the pads. Stencil/tool geometry, paste height and joint profiles are illustrative and exaggerated for legibility. The source board and component meshes remain unmodified. This addresses the earlier presentation problem where paste appeared at full-board scale and the close-up arrived only after placement.

Reduced motion uses a finished-board poster and no initial CAD requests. Data Saver requires explicit loading. Model failure or WebGL context loss retains the poster and collapses the scroll region. Only changing visible frames render. A reader who skips while loading is not displaced by later scroll-region expansion. Existing detailed viewers, firmware and teaching tools remain explicitly linked.

## Development and checks

Serve the repository root, then open `/v5/`. No runtime framework or package installation is needed for the site.

```sh
python v5/build-pages.py
python v5/build-pages.py --check
python v5/tests/static.py
node --check v5/assembly.js
node --check v5/solder-process.js
node --check v5/interiors.js
node --check v5/flight.js
node --check v5/workbench.js
node v5/tests/assembly.cjs
node v5/tests/solder-visibility.cjs
node v5/tests/interiors.cjs
```

Browser checks require Playwright and a browser. Set `V5_BASE_URL` for the repository-root server; `PLAYWRIGHT_MODULE` may identify an available package, and `CHROMIUM_EXECUTABLE` may identify an installed Chrome/Chromium. `V5_QA_OUTPUT` (assembly) and `V5_QA_DIR` (interiors) select report/screenshot folders outside tracked source.

The solder-visibility suite captures printing, exposed paste, seated parts and wetting at a held camera on desktop and mobile. Images require visual review; changed image hashes alone do not establish clarity or manufacturing accuracy. `V5_CAPTURE_BASELINE=1` captures the earlier sequence for comparison, and `V5_CAPTURE_STOPS` overrides the sampled progress values.

Acceptance completed in Chromium using SwiftShader: exact final positions and rotations for 54 source part groups; repeatable reverse scrolling; idle/offscreen lifecycle; reduced-motion initial and live-change behavior; Data Saver; failed CAD/context loss; skip during delayed loading; 320/390 mobile layouts. Collection checks cover 16 projects, two board records, search/filter/empty/reset, URL restoration, keyboard, no-JavaScript access and every generated case's media. Desktop/mobile frames were visually inspected. See the review output supplied with this change for detailed reports.
