# Electronics collection

The public collection includes the Framework Logic Analyser and Tamagotchi SD Card. Coaster appears in v2 with its existing assembly and drink simulation. LoRa Receiver, RF Test Board, Metroboard and both Skylabs boards have CAD inspectors.

## Sources and limits

`scripts/content/hardware-catalog.json` holds the public content and its evidence. Board exports are in `assets/models/hardware/<slug>/`, with source hashes, component references, model coverage, original dimensions and recovered-library provenance in each `assembly.json`. Missing 3D models do not become invented physical components. The board's original footprints and copper remain present.

Metroboard retains its existing dimensioned WS2812B-2020 package representation at all 291 authored placements because the referenced supplier mesh is unavailable. It moves as one LED bank. The model-coverage table is in `assets/models/hardware/README.md`; the inspectors do not imply that every footprint has a component body.

Only projects approved for public release belong in the maintained catalog. Local drafts and archived work are excluded from site generation and deployment.

## Rebuilding

1. Export the selected authored boards with `python scripts/build-hardware-catalog.py "D:/Electronics Projects" --kicad-cli <path> --kicad-models <3dmodels-directory> --model-library <additional-library>`. Additional libraries must contain the actual referenced geometry. `--only` accepts comma-separated model slugs.
2. Start a static server at the repository root. Run `node scripts/render-hardware-catalog.cjs`. Optional environment: `V2_BASE_URL`, `CHROMIUM_EXECUTABLE`. Playwright is required.
3. Run `python scripts/finish-hardware-posters.py` to encode the transparent 1600×1200 captures as WebP.
4. Run `python scripts/build-v2-cases.py`, `python scripts/audit-v2.py`, and `node scripts/verify-hardware-catalog.cjs`.

## Runtime

The DOM-free factory in `assets/v2-hardware-models.js` is shared by the inspectors and the telemetry hero. It retains reference-named physical groups and applies one reversible separation value. Rendering stops when settled, offscreen or hidden. Camera rotation supports pointer and keyboard, and native vertical scrolling remains available. Static posters and project details survive missing assets, disabled JavaScript and context loss, including a graphics failure during an asynchronous load.

KiCad mask/core palette values are converted from display RGB into the renderer's linear working space. Mask opacity remains source-derived, allowing the original copper artwork to remain visible through the finish.

## Skylabs

The v2 Skylabs page uses one shared inspector with aircraft/ground-station switching. The nested board pages use the same controls and model factory. The previous image turntables remain only in the original portfolio. Curated component explanations in `scripts/content/skylabs-components.json` select the corresponding physical reference groups, including paired circuits. Static descriptions and board links remain usable without JavaScript; `#assembly` remains an alias for the consolidated `#explore` section.
