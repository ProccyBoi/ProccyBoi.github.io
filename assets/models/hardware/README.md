# Hardware geometry catalog

These assets are generated from the original KiCad projects. The exporter reads the original boards, works on temporary copies and verifies SHA-256 hashes afterward. It never saves the electronics projects or changes their component placements.

## Rebuild

Requires Python 3, KiCad 9 CLI, its standard 3D model library and the original EasyEDA STEP library. Exact recovered library models are retained in `_libraries` with download provenance and hashes.

```sh
python scripts/build-hardware-catalog.py /path/to/electronics-projects \
  --kicad-cli /path/to/kicad-cli \
  --model-library /path/to/easyeda2kicad.3dshapes
```

Use `--only usense,tamagotchi-sd-card` to rebuild selected boards or `--board slug=relative/path.kicad_pcb` to add another explicit source. `--kicad-models` overrides the standard library location. The Skylabs targets use sibling `../Skylabs` paths, recorded in each manifest.

Each folder contains `board.glb`, `silk-front.svg`, `silk-back.svg` and `assembly.json`. The catalog records skipped empty or outline-free boards. Microphone has no populated board content; Nixie Clock has no physical board outline and is not exported.

## Coordinate and material contract

- Native GLB coordinates are metres, +Y up, KiCad X → +X and KiCad Y → +Z.
- `boundsMm` is `[minX, minY, maxX, maxY]` in authored KiCad coordinates, measured from exported core geometry. It excludes component, copper and silkscreen overhangs.
- `scaleToMillimetres` is 1000. `translationMm` centres the board and places the core bottom at Y = 0. `thicknessMm` comes from the original board.
- Footprints include original reference/value, placement, front/back side, DNP and library-model presence. Reference-named groups remain independently movable.
- `materials` identifies the exported pad, silk, mask and core materials. `materialProperties` preserves their native palette and shading values. Material names vary by board.
- SVGs contain the original marking layer, cropped to physical board bounds, with white ink and no drawing sheet or artificial drill circles.
- Business Card and both notebook covers include original copper tracks and zones. Notebook example footprints remain unpopulated; `unpopulated: true` is intentional.

The loader may batch faces inside a reference group. It must preserve the component groups and their original transforms.

## Recovered real geometry

The logic analyser and µSense controller packages use the exact originally referenced KiCad STEP filenames from the official 5.1.10 library. Their source headers retain attribution and the KiCad library license exception. Download URLs and hashes are in `_libraries/kicad/sources.json`.

The logic analyser's Molex 105444 plug is the existing exact `P1` geometry in `assets/models/framework-esp32/framework-usbc.glb`; the `connector` field specifies its transform and hash. It is supplied separately from the board GLB.

Tamagotchi's socket uses [Kyocera's CAD for 145638009511859+](https://ele.kyocera.com/en/product/connector/memory_card_connectors/5638/145638009511859/). The original downloaded STEP is retained in `_libraries/kyocera`. Its native coordinates are registered to the source footprint by Z rotation 180° and Y translation +8.5 mm. Both mounting bosses align with the original NPTH centres, and the housing aligns with the footprint's fabrication outline and drawing BJS5638029. Registration metadata is in the board manifest.

Tamagotchi's two switches preserve the exact four Box primitives of the project's existing VRML model. The exporter converts their original 0.1-inch VRML units and maintains the single-root GLB structure. `literalVrmlModels` records the source hashes. No replacement shape is inferred.

## Remaining coverage

`missingModels` describes unresolved assigned physical models. `unmodeledFootprints` also records footprints without an assigned model; mounting holes, logos and test points commonly need no separate body.

| Board | Remaining physical omissions |
| --- | --- |
| µSense | U7 CH343P USB–UART body |
| Business Card | U1 NT3H1101/NT3H1201 has no assigned body model |
| Logic analyser | J1 pin header has no assigned body model; P1 is supplied by `connector` |
| Kiku | D3 0201 diode |
| LoRa receiver | BT2 battery holder, J1 USB-C receptacle, U7 NEO-M9N module |
| Metroboard | J1 USB-C receptacle; U2/U5 level shifters have no assigned models |
| Skylabs telemetry | Q4 transistor and BT2 battery holder |
| RF test board / Skylabs ground station / Tamagotchi | No unresolved assigned models |
| Notebook front/back | Intentionally bare graphic/reference boards |

Metroboard's exact WS2812B-2020 STEP/WRL reference is absent from the supplied and installed libraries. `geometryFallbacks` explicitly authorizes the existing published `assets/metroboard-3d.js` LED package representation at all 291 original board positions. It is a package representation, not supplier CAD. TramTrace uses a different WS2812C part and is not substituted.
