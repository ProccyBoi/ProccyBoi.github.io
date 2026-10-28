# V5 — From the workbench

An independent portfolio at `/v5/`: home, 16 project stories, two Skylabs board records, searchable collection, About and a reference notebook. Existing versions and shared model assets are retained.

## Evidence and design

The [reference notebook](/v5/references/) records 12 creator resources, three dated social posts and five design decisions. Research was checked on 28 October 2026. Direct X reads were blocked; the specific post text was read in creator-linked/embedded articles. This is a source-led sample of the Japanese maker web with explicit X trails, not an exhaustive survey or popularity ranking.

The main sources are 74th's RP2040 alignment jig, ciniml's M5Stack reflow controller and STEP model combiner, Lang-ship's EasyEDA/OSHWLab workflow, CHIRIMEN, UniBoard SPICE, and Switch Science's historical reflow guide. International interaction references include Ciechanowski's Mechanical Watch, KiCanvas, InteractiveHtmlBom, Falstad and CPU Land. Sources and boundaries are linked individually in the notebook.

The composition uses a warm paper background, green accent and existing self-hosted Archivo/Plex Mono. Those are editorial choices, not scientifically proven preferences or a claim of a Japanese visual style. The hypothesis is that a clear identity, early project links and one optional assembly story help visitors reach and understand the work. No user study or conversion lift is claimed. A follow-up study should ask visitors to identify Andrew's work, find the telemetry evidence, and reach CV/contact, comparing task completion and misconceptions with the existing site.

W3C keyboard, reflow, focus visibility and motion guidance inform the implementation. The 320px surrounding layout, native links, visible focus, static reduced-motion presentation and skip route have explicit acceptance checks. MDN progressive enhancement and visibility tracking inform fallbacks and rendering lifecycle. Desktop tests are not screen-reader certification, physical-device frame-rate measurements or field Core Web Vitals data.

## Content and geometry

`build-pages.py` renders 20 interiors from the existing `v4/content/projects.json` evidence ledger and established public profile material. Home and the notebook are authored separately. Published targets, recorded results and limitations remain distinct. Photos and CAD assets come from the existing approved site; no new third-party imagery is imported.

`assembly.js` loads the existing telemetry model and extracted CAD lands near the viewport. It preserves source triangles, component rotations and final placements. The camera and component reveal respond to native document scrolling. Paste volume, wetting and process timing are illustrative; this is not production stencil data, a measured reflow trace or a validated process recipe. Underside and through-hole parts appear in separate steps. Package-model limitations of the existing export remain; there was no new verification against a separate local board project.

Reduced motion uses a finished-board poster and no initial CAD requests. Data Saver requires explicit loading. Model failure or WebGL context loss retains the poster and collapses the scroll region. Only changing visible frames render. A reader who skips while loading is not displaced by later scroll-region expansion. Existing detailed viewers, firmware and teaching tools remain explicitly linked.

## Development and checks

Serve the repository root, then open `/v5/`. No runtime framework or package installation is needed for the site.

```sh
python v5/build-pages.py
python v5/build-pages.py --check
python v5/tests/static.py
node --check v5/assembly.js
node --check v5/interiors.js
node v5/tests/assembly.cjs
node v5/tests/interiors.cjs
```

Browser checks require Playwright and a browser. Set `V5_BASE_URL` for the repository-root server; `PLAYWRIGHT_MODULE` may identify an available package, and `CHROMIUM_EXECUTABLE` may identify an installed Chrome/Chromium. `V5_QA_OUTPUT` (assembly) and `V5_QA_DIR` (interiors) select report/screenshot folders outside tracked source.

Acceptance completed in Chromium using SwiftShader: exact final positions and rotations for 54 source part groups; repeatable reverse scrolling; idle/offscreen lifecycle; reduced-motion initial and live-change behavior; Data Saver; failed CAD/context loss; skip during delayed loading; 320/390 mobile layouts. Collection checks cover 16 projects, two board records, search/filter/empty/reset, URL restoration, keyboard, no-JavaScript access and every generated case's media. Desktop/mobile frames were visually inspected. See the review output supplied with this change for detailed reports.
