# Raspberry Pi expansion card

The Pi showcase uses the user's RP2354B board design and the supplied Framework reference enclosure. The RP2354B is a microcontroller; this is not a Linux single-board computer.

## Inputs and provenance

The source project is supplied separately. Pass its root directory to the export script; it is never edited.

| Asset | Source |
| --- | --- |
| Board, pads and component groups | `ExpansionCards-main/Electrical/KiCad_templates/Expansion_Card/Expansion_Card.kicad_pcb` |
| Front/back markings | Original `F.SilkS` / `B.SilkS` layers of that board |
| Threaded-insert enclosure | `ExpansionCards-main/Mechanical/Printable/3D/ExpansionCard_ThreadedInsert.stl` |
| Molex 105444 USB-C plug | Exact `P1` node of the existing `assets/models/framework-esp32/framework-usbc.glb` |

The similarly named `Electrical/Microcontroller` directory contains the older SAMD21 reference board and is deliberately excluded. The MicrocontrollerHousing OpenSCAD files include features for that reference design and are also excluded.

`assets/models/framework-pi/assembly.json` records all 37 source footprints, component references, transforms and SHA-256 hashes. There are 32 modeled populated parts in the board GLB plus the separate USB-C plug. Key references are `U5` RP2354B, `U3` W25Q128JVS flash, `U2` AMS1117-3.3, `U1` crystal, `SW1` / `SW2` tactile controls and `L2` inductor. The source's EasyEDA component WRLs have STEP companions; KiCad substitutes those real models during GLB export. Missing components other than the separately supplied `P1` fail the export.

Framework's reference mechanical design and board outline are attributed to **Framework Computer Inc, CC BY 4.0**, as recorded in the supplied Mechanical/Electrical READMEs. [Framework Expansion Cards](https://github.com/FrameworkComputer/ExpansionCards), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Component shapes and their markings retain the supplied model-library provenance. The enclosure is presented as reference packaging. The viewer makes no physical-fit or electrical-validation claim.

## Rebuild

Requirements: Python 3, KiCad 9 CLI and the original component libraries. `--custom-models` optionally relocates the `easyeda2kicad.3dshapes` folder and requires each original WRL and STEP companion. Source hashes are checked before and after conversion.

```sh
python scripts/build-framework-pi.py "/path/to/Framework Expansion Card - Raspberry Pi" --kicad-cli kicad-cli
```

The browser render uses local assets. Start a static server at the repository root, install Playwright in the Node environment, and optionally set `V2_BASE_URL` or `CHROMIUM_EXECUTABLE`.

```sh
python -m http.server 8080
node scripts/render-framework-pi.cjs
python scripts/finish-framework-pi.py
node scripts/verify-framework-pi.cjs
```

The finishing script requires Pillow. It verifies the 1600 × 1200 RGBA WebP before deleting only its intermediate `framework-pi-cad.png`. It does not alter source images or CAD. The transparent poster shares its scene, materials and camera with the assembly viewer. The capture attribute hides the reference enclosure for a clean board image.

## Coordinates

The board GLB uses **metres, +Y up, source KiCad X → +X and Y → +Z**. To put it in a millimetre scene, scale by 1000 and translate `(-140, 0, -142)`. The board is 26 × 30 × 0.8 mm. Assembly mode raises its underside to Y = 3.1 mm, matching the enclosure's mounting bosses.

The enclosure retains its native millimetre coordinates and rotation, translated `(0, 0, 15)`. Its source bounds are `[-15, 0, -32]` to `[15, 6.8, 0]`. The bosses align with the PCB holes at X = ±11.3 mm, Z = 4.5 mm.

Detach the connector node `P1`, scale by 1000, rotate X by −π/2, and place at `(0, 0.8, -16.4)` in board coordinates or `(0, 3.9, -16.4)` in the assembly. The front SVG's viewBox is `127 127 26 30`. Its 26 × 30 mm textured plane sits 0.02 mm above the board and rotates X by −π/2, with geometry cutouts at both 2.2 mm mounting holes. Native GLB materials are pads `mat_18`, silk `mat_19`, solder mask `mat_20`, core `mat_21`; the display substitutes the original SVG for the tessellated silk.

## Viewer integration

The durable case body is `scripts/content/framework-raspberry-pi.html`. The page wrapper loads only `/assets/v2-pi.css` and `/assets/v2-pi.js`. Three.js and GLTFLoader load locally after the visitor activates **Explore in 3D**. Static imagery works before JavaScript or WebGL.

The root is `[data-pi-inspector]`; `PiCardStudio.mount(root)` permits later insertion. Controls provide camera presets, finite 1.1-second explode/reassemble motion, housing visibility, reset and component descriptions. Arrow keys rotate, +/− zoom and Home resets. Horizontal touch input rotates while vertical scrolling and pinch zoom remain available. Reduced motion resolves to the requested state immediately. Offscreen/hidden scenes pause motion. Rendering stops when idle. Model or context failure disposes listeners, observers, animation frames and renderer resources and restores the poster.

Diagnostics: `data-pi-state` (`poster`, `loading`, `ready`, `unavailable`), `data-pi-motion`, `data-pi-angle`, `data-pi-progress`, `data-pi-frames`, `data-pi-components`, `data-pi-selection`. The `pi-dispose` event explicitly tears down an instance. The standalone verifier checks loading, assembly motion, camera/keyboard controls, component selection, housing controls, idle rendering, offscreen pause/resume, mobile sizing, reduced motion and fallback paths.

KiCad exports individual CAD faces as separate primitives. The viewer batches them by material inside each component group, reducing the complete assembly to 89 draw calls in the verified scene while retaining the source triangles and independent component transforms.

Exploded component positions are temporary presentation transforms; each part's original position and quaternion remain stored and are restored on reassembly. No geometry is reshaped, replaced with approximate parts or AI-generated.
