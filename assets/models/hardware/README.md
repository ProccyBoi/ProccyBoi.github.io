# Hardware geometry catalog

These assets are generated from the original KiCad projects. The exporter reads the original boards, works on temporary copies and verifies SHA-256 hashes afterward. It never saves the electronics projects or changes their component placements.

## Rebuild

Requires Python 3, KiCad 9 CLI, its standard 3D model library and the original EasyEDA STEP/WRL library. Exact recovered library models are retained in `_libraries` and the applicable board's `source-cad` directory with provenance and hashes.

```sh
python scripts/build-hardware-catalog.py /path/to/electronics-projects \
  --kicad-cli /path/to/kicad-cli \
  --model-library /path/to/easyeda2kicad.3dshapes
```

Use `--only framework-logic-analyser,tamagotchi-sd-card` to rebuild selected boards or `--board slug=relative/path.kicad_pcb` to add another explicit source. `--kicad-models` overrides the standard library location. The Skylabs targets use sibling `../Skylabs` paths, recorded in each manifest.

Each folder contains `board.glb`, `silk-front.svg`, `silk-back.svg` and `assembly.json`. The catalog records skipped empty or outline-free boards. Microphone has no populated board content; Nixie Clock has no physical board outline and is not exported.

## Coordinate and material contract

- Native GLB coordinates are metres, +Y up, KiCad X → +X and KiCad Y → +Z.
- `boundsMm` is `[minX, minY, maxX, maxY]` in authored KiCad coordinates, measured from exported core geometry. It excludes component, copper and silkscreen overhangs.
- `scaleToMillimetres` is 1000. `translationMm` centres the board and places the core bottom at Y = 0. `thicknessMm` comes from the original board.
- Footprints include original reference/value, placement, front/back side, DNP and library-model presence. Reference-named groups remain independently movable.
- `materials` identifies the exported pad, silk, mask and core materials. `materialProperties` preserves their native palette and shading values. Material names vary by board.
- SVGs contain the original marking layer, cropped to physical board bounds, with white ink and no drawing sheet or artificial drill circles.

The loader may batch faces inside a reference group. It must preserve the component groups and their original transforms.

## Recovered real geometry

The logic analyser controller package uses the exact originally referenced KiCad STEP filename from the official 5.1.10 library. Their source headers retain attribution and the KiCad library license exception. Download URLs and hashes are in `_libraries/kicad/sources.json`.

The logic analyser's Molex 105444 plug is the existing exact `P1` geometry in `assets/models/framework-esp32/framework-usbc.glb`; the `connector` field specifies its transform and hash. It is supplied separately from the board GLB. Its placement is derived from the actual P1 footprint, retaining the native 3.4 mm mating-axis registration and centring its two contact rows on the board midplane. The former top-surface placement lifted the connector by 0.445 mm.

EasyEDA WRL and STEP companions do not necessarily share an origin. The exporter preserves the literal authored WRL faces for the logic analyser's X1/U1/U4/U5/U6/J3 and LoRa U1, retaining KiCad's complete reference-node transform, including backside placement and model offsets. `authoredVrmlMeshes` records source hashes and both bounding boxes. In particular, the logic analyser's J3 STEP was shifted by approximately 4.002 mm along the mating axis and 1.27 mm vertically relative to its selected WRL. This caused the rear socket to intersect the board and miss its pads. The literal WRL restores the correct seven-pad alignment.

LoRa J1 uses the exact HRO TYPE-C-31-M-12 CAD. Its native frame is registered by 180-degree rotation and +1.05 mm KiCad Y translation: the shell matches the +/-3.65 mm fabrication outline, the locating bosses match +/-2.89/-2.60 mm, and the solder contacts align with the -4.045 mm pad row. LoRa U7 uses the [official u-blox NEO package STEP](https://github.com/u-blox/3D-Step-Models-Library/blob/master/POS/NEO.STEP). Its assembly origin is centred and rotated 180 degrees so both contact rows match the footprint's asymmetric -0.4/+2.6 mm gap and 1.1 mm pitch. Original files and provenance are in `lora-receiver/source-cad`; `modelRegistrations` records the exact transforms.

LoRa BT2 is a **dimensioned representation, not recovered manufacturer CAD**. Its side envelope and solder tabs follow Renata drawing 3.87600.446 revision 6 and the authored fabrication outline: 28.5 mm body length, 5.4 mm height, R11 outer envelope, 20 mm cell envelope, 29.4 mm contact pitch and 2.6 x 3.5 x 0.15 mm solder tabs. The drawing is retained in `source-cad`. Spring internals and retention detail are omitted rather than guessed; the model intentionally shows an empty holder, since the PCB assigns the holder footprint and does not specify a populated cell model. `dimensionedRepresentations` identifies this coverage separately from actual CAD.

Tamagotchi's socket uses [Kyocera's CAD for 145638009511859+](https://ele.kyocera.com/en/product/connector/memory_card_connectors/5638/145638009511859/). The original downloaded STEP is retained in `_libraries/kyocera`. Its native coordinates are registered to the source footprint by Z rotation 180° and Y translation +8.5 mm. Both mounting bosses align with the original NPTH centres, and the housing aligns with the footprint's fabrication outline and drawing BJS5638029. Registration metadata is in the board manifest.

Tamagotchi's two switches preserve the exact four Box primitives of the project's existing VRML model. The exporter converts their original 0.1-inch VRML units and maintains the single-root GLB structure. `literalVrmlModels` records the source hashes. No replacement shape is inferred.

## Remaining coverage

`missingModels` describes unresolved assigned physical models. `unmodeledFootprints` also records footprints without an assigned model; mounting holes, logos and test points commonly need no separate body.

| Board | Remaining physical omissions |
| --- | --- |
| Logic analyser | J1 is the authored four-hole pogo contact footprint with no selected body model; no conventional header is inferred. P1 is supplied by `connector`. |
| LoRa receiver | All 40 assigned physical parts represented; BT2 covers only the documented holder envelope and solder tabs. |
| Metroboard | J1 USB-C receptacle; U2/U5 level shifters have no assigned models |
| Skylabs telemetry | Q4 transistor and BT2 battery holder |
| RF test board / Skylabs ground station / Tamagotchi | No unresolved assigned models |

Metroboard's exact WS2812B-2020 STEP/WRL reference is absent from the supplied and installed libraries. `geometryFallbacks` explicitly authorizes the existing published `assets/metroboard-3d.js` LED package representation at all 291 original board positions. It is a package representation, not supplier CAD. TramTrace uses a different WS2812C part and is not substituted.
