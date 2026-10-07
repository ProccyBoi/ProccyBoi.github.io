# V3: a board becoming a product

This is the archived manufacturing study from commit `8f0cca9`. The current homepage follows the [Skylabs aircraft story](v3-aircraft-design.md). The manufacturing assets remain available for reuse; the browser checks described below apply to that earlier homepage. Use `scripts/verify-v3-aircraft.cjs` to check the current version.

V3 is a separate dark experiment. Its opening follows TramTrace from a copper-clad substrate through etching, solder mask, legend, paste, component placement and reflow, ending with the working display. The animation explains the object on screen. There are no photo stacks, decorative electrical labels or invented circuitry.

The copy occupies the left side on desktop and the upper part of the screen on phones. One registered board stays in view. Three ordinary anchor links—Fabrication, Assembly and In use—navigate the story using native page scrolling. Five short copy beats keep the physical changes understandable without narrating every operation.

## Source fidelity

- The finished geometry is the prepared TramTrace CAD used by v2: 104 meshes, 96,514 triangles, a 207.81 × 94.55 mm board and the original component transforms. No geometry is simplified for this presentation.
- `assets/models/manufacturing/tramtrace/manufacturing.json` records source hashes, the 1.6 mm two-layer stackup, 143 component positions, 116 LEDs and 611 production paste apertures. Its cropped SVG layers share the existing silkscreen registration.
- Copper is a physical surface stencil made from the front-copper export. Etching removes the non-circuit area of the copper sheet. Copper and paste reuse the source laminate’s top-face triangulation, preserving its rounded perimeter and cutouts. The final mask, pads and legend use the existing CAD and silkscreen. Paste uses the actual production Gerber apertures.
- The prepared CAD merges LEDs into four draw groups. Additional shader attributes associate each original vertex with its registered LED centre. Each LED receives its own placement time and translation; its final vertex coordinates, normals, UVs and indices are unchanged. The other 27 packages move as intact CAD groups and return exactly to their assembled transforms.
- Shared `V2ProductStudio` lighting and material treatment keep the complete board consistent with the v2 viewers. Thin mask surfaces receive component shadows but do not cast a second coplanar shadow onto the core.
- V3’s fitted shadow camera uses a 0.0007 normal bias and −0.00015 depth bias at the normalized one-unit board span. A same-scene comparison checked laminate, copper and the finished assembly: the small offset removes diagonal self-shadow bands while retaining component and ground shadows. New copper color is converted from sRGB; original CAD colors are unchanged.

This is an explanatory sequence, not a recording of a factory run or a claim about the board’s actual placement order. The choreography distinguishes fabrication from assembly: paste precedes placement, then reflow joins the placed parts before the finished state. The process ordering follows [Eurocircuits’ PCB manufacturing overview](https://www.eurocircuits.com/technical-guidelines/pcb-manufacturing-technology/) and [assembly manufacturing overview](https://www.eurocircuits.com/technical-guidelines/assembly-manufacturing-technology/).

## Motion and loading

The scene is a deterministic function of scroll progress. Copper, mask and legend develop on the same board. Packages approach from small, varied offsets, align over their own pads, then descend vertically. The order varies across the board; components are never lifted as one uniform cloud. During reflow, the matte paste becomes reflective and settles toward the pads, then hands over to the complete source assembly before the real working photograph appears.

Only the TramTrace model, front-copper stencil and paste stencil are fetched for the scene. Back copper is preserved as an available source asset but is not downloaded for a camera sequence that never exposes it. Model transport, lighting, textures and the renderer load in parallel. The full-quality poster paints immediately; it disappears only after a successful CAD frame. Later project photographs are viewport-gated.

No render loop runs while the scene is still, offscreen, hidden or showing a static fallback. Reduced motion, Save Data and viewports no taller than 640 pixels use a compact, readable static story, including landscape phones. Disabled JavaScript and failed rendering retain the original poster, source copy, ordinary anchors, project links and a native working photograph in the last chapter. Static photographs load near their viewport; normal animation does not request that hidden fallback. The final working photograph never replaces the CAD until its image has loaded.

## Validation

`scripts/verify-v3-manufacturing.cjs` checks the real manufacturing phases, registered component count, varied arrival times, exact final transforms, backwards scrolling, native stage navigation, finite rendering, loading and failure behavior, and desktop/mobile layout. Its `--static-only` mode avoids WebGL. `scripts/build-v3-pages.py --check` and `scripts/audit-v3.py` preserve the public v3 interiors, original viewers, metadata and routes.

The full 11-case run passed at 1440 × 1000, 390 × 844 and 320 × 740, including eight static/preference/failure cases and the 844 × 390 landscape fallback. A final `--scene-only --viewport=1265x712` run passed after the shadow correction and native-anchor padding fix; it captures every manufacturing phase and the settled working photograph. Desktop scene checks also exercise live reduced-motion changes and actual WebGL context loss from the finished stage, verifying that the readable chapter, working photo and project link survive.
