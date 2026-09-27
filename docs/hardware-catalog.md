# Electronics collection

The September 2026 continuation adds the Framework Logic Analyser, uSense, Tamagotchi SD Card, NFC Business Card, Kiku and PCB Notebook. Coaster now appears in v2 with its existing assembly and drink simulation. LoRa Receiver, RF Test Board, Metroboard and both Skylabs boards gain source-CAD inspectors.

## Sources and limits

`scripts/content/hardware-catalog.json` holds the content and its evidence. Board exports are in `assets/models/hardware/<slug>/`, with source hashes, component references, model coverage, original dimensions and recovered-library provenance in each `assembly.json`. Missing 3D models do not become invented physical components. The board's original footprints and copper remain present.

Metroboard retains its existing dimensioned WS2812B-2020 package representation at all 291 authored placements because the referenced supplier mesh is unavailable. It moves as one LED bank. The full model-coverage table is in `assets/models/hardware/README.md`; the inspectors do not imply that every footprint has a component body.

The notebook's package examples are artwork, so those exports explicitly exclude fitted parts. The NFC card is based on the Salvaged Circuitry / Brian D. Carlton design, under CC BY-NC-SA 4.0; the case includes attribution. Inherited template photographs are not used as Andrew's build photographs.

Microphone and Cable Holder do not contain populated PCB layouts, while the Nixie layout has no routed board outline. Firmware/reference folders were not turned into fictional CAD. These discoveries are not claims that the underlying ideas or firmware are finished or unfinished.

## Rebuilding

1. Export the selected authored boards with `python scripts/build-hardware-catalog.py "D:/Electronics Projects" --kicad-cli <path> --kicad-models <3dmodels-directory> --model-library <additional-library>`. Additional libraries must contain the actual referenced geometry. `--only` accepts comma-separated model slugs.
2. Export Kiku's mechanical parts with `python scripts/build-kiku-product.py "D:/Electronics Projects/Walkman - Blobject"`. This requires `cadquery-ocp` and its matching dependencies. It copies nine source STLs and tessellates four source BREP bodies without changing their coordinates.
3. Start a static server at the repository root. Run `node scripts/render-hardware-catalog.cjs`, then `node scripts/render-hardware-catalog.cjs kiku-product`. Optional environment: `V2_BASE_URL`, `CHROMIUM_EXECUTABLE`. Playwright is required.
4. Run `python scripts/finish-hardware-posters.py` to encode the transparent 1600×1200 captures as WebP.
5. Run `python scripts/build-v2-cases.py`, `python scripts/audit-v2.py`, and `node scripts/verify-hardware-catalog.cjs`.

## Kiku P2

The mechanical STL/BREP files retain assembled millimetre coordinates. Their common transform into the PCB viewer is `(X−30, Z, 52.5−Y)/105`. The board's authored centre is `(102.11,105.40)` mm. This is equivalent to the source mapping `Xmechanical=Xpcb−72.11`, `Ymechanical=157.90−Ypcb`.

All 14 groups use the source review's separation distances: lens +65 mm; front shell/buttons/knob +47; carrier/LCD +26; PCB 0; guard −12; battery/speaker/retainer −25; rear shell −47; stand −61. The assembled board is merged by material in the product view. Individual board components remain selectable in its separate PCB inspector.

The battery, speaker and LCD bodies are the source's fit envelopes. Presentation colours follow `Mechanical/scripts/render_p2.py`. These are CAD presentation choices, not a claim about certified materials. P2 is the revision following a printed P1; physical fit qualification remains documented in the case.

## Runtime

The factory retains reference-named physical groups and applies one reversible separation value. Notebook exports remain board-only. Rendering stops when settled, offscreen or hidden. Camera rotation supports pointer and keyboard, and native vertical scrolling remains available. Static posters and project details survive missing assets, disabled JavaScript and context loss, including a graphics failure during an asynchronous load.

KiCad mask/core palette values are converted from display RGB into the renderer's linear working space. Mask opacity remains source-derived, allowing the original copper artwork to remain visible through the finish.
