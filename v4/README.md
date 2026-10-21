# V4 — cinematic engineering portfolio

An independent static portfolio at `/v4/`. Its home, collection, 16 project stories, two Skylabs board records and profile use one coherent visual system. No root, v2, v3 or shared asset files are modified.

## Design

The current official [Anduril home](https://www.anduril.com/) and [Fury product page](https://www.anduril.com/fury) were inspected visually in a cloud browser on 21 October 2026. The useful principles are quiet small navigation, near-black negative space, broad edge-to-edge media, a disciplined 16px image grid, simple arrows, oversized title-case product titles and short asymmetric descriptor columns. The portfolio applies those principles to Andrew's own identity, factual engineering and existing project imagery. It does not use Anduril branding, copy, product imagery or suggest affiliation.

The opening is a real close-up photograph of the Skylabs telemetry board. Its blue solder mask supplies the accent. Selected projects follow as a full-width aircraft scene and a restrained product wall. Project pages distinguish manufactured hardware, CAD design, firmware prototypes and published test results. The hero is not a video or a synthetic live data feed. Source-CAD renders remain illustrations, not new manufacturing evidence.

Prior design resources were revisited through the repository's reference ledger: image-first composition and implementation review, accessible motion, physical-asset fidelity and selected-state continuity. They inform the craft without importing a template or a framework for its own sake. Existing self-hosted Archivo is used at a lighter weight and tighter editorial scale, rather than copying the previous visual skin.

## Runtime and navigation

- Plain pre-rendered HTML, one stylesheet and one small script. No framework, third-party request, WebGL/WebGPU allocation, giant model download, loading gate or scroll interception on these pages.
- High-priority responsive hero photograph. Other photographs use native lazy loading and exact dimensions. Project index is fully navigable without JavaScript.
- Pointer parallax only updates on actual pointer input, with one pending animation frame at most. Offscreen, hidden-tab, reduced-motion, coarse-pointer and Save Data states disable it. No perpetual render loop.
- Native dialog for the mobile menu and photo inspection, with Escape, focus return, image arrows and meaningful fallback image links. Only requested clipboard copy writes to the clipboard.
- Search and discipline filters preserve query state in the URL; Back restores the collection. The 18 detailed records have their own stable routes.
- Advanced existing interactive models, simulator and flight tools remain one explicit link away. They are not downloaded as a side effect of reading the portfolio. This is an editorial experience with real detail, not a clone of the heavier v2 viewers.

## Maintenance

`content/projects.json` is a factual snapshot from the existing project records and evidence ledgers. `build.py` renders 21 pages using only Python's standard library. Keep published targets, observed results and limitations distinct. Do not invent reliability figures or turn a model into evidence of physical fit.

- `python3 v4/build.py`
- `python3 v4/build.py --check`
- `python3 v4/tests/static.py`
- `node --check v4/assets/site.js`
- With a repository-root HTTP preview and pinned Playwright: `node v4/tests/browser.cjs` and `node v4/tests/browser.cjs --webkit`.

The isolated `verify-v4-cinematic.yml` workflow tests the review branch and uploads screenshots plus JSON evidence. Browser emulation and transferred resource bytes are not physical-device performance benchmarks.
