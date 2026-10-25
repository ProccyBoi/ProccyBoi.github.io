# Dash / Driving Companion PCB

Generated from `Driving Companion/Driving Companion.kicad_pcb` in the supplied ELEC3117 project folder. This is the board saved on 28 September 2025, newer than the separate `Driving Companion V2` board saved on 1 August 2025. The older July STL is not used.

The authored board is 45.2 × 45.2 × 1.6 mm, with 2 mm corner radii and three M2 mounting holes. The browser export preserves its placements, pads, silkscreen, mask and board outline. The housing is not included. The source SHA-256 is `88fb822d575644c5412ef8758e3cd9f3ed03730aa67f322563188b7846269b9e`.

## Model provenance

- Standard component bodies use the original referenced KiCad 9.0.2 library geometry.
- U7's exact `QFN-24-1EP_4x4mm_P0.5mm_EP2.7x2.6mm` model was recovered from the official KiCad 6.0.11 library. Its original attribution and library exception are retained in `source-cad`.
- J1 uses the exact HRO TYPE-C-31-M-12 model already retained for the site's LoRa board. The documented 180° / 1.05 mm registration aligns its locating bosses, contacts and shell with this same authored footprint. It is recorded in `modelRegistrations`.
- U1 uses the official KiCad 3.9 × 4.9 mm SOIC-8 package with matching lead count and 1.27 mm pitch. Its underside exposed pad is 2.41 × 3.81 mm, compared with the source footprint's 2.41 × 3.3 mm.
- U6 uses the official KiCad 3 × 3 mm TQFN-16 package with matching 0.5 mm lead pitch. Its underside exposed pad is 1.6 × 1.6 mm, compared with the source footprint's 1.23 × 1.23 mm.
- U5 originally had no assigned body. The source explicitly identifies SOT-23-6 UMW, a centred 1.6 × 3.0 mm fabrication outline and six pads at 0.95 mm pitch. The official KiCad SOT-23-6 package is placed at the unchanged footprint centre and rotation. Its 1.55 mm library height exceeds the footprint's 1.40 mm maximum, so it is a display-only package representation, not recovered UMW CAD or housing-fit geometry.

U1, U6 and U5 are explicitly identified as package-library representations in `packageLibraryFallbacks`, including the library hashes and limitations. The two exposed-pad alternatives do not change the original PCB pad geometry. These assets are for interactive presentation, not manufacturing clearance verification.

`assembly.json` distinguishes source-assigned models, exported bodies, unresolved assigned models and source footprints that never had a body. Mounting holes and the rear logo do not require separate component bodies. Exact source URLs and hashes for recovered files are in `source-cad/sources.json`.

The final export has 66 component bodies across 71 footprints: 65 of the 66 source-assigned models plus the documented U5 representation. LS1's Molex PicoBlade 53047-0210 body remains unresolved; its original holes, pads and silkscreen are preserved. The other four footprints are the three mounting holes and rear logo. No substitute speaker connector or housing is invented.

## Rebuild

From the website repository, with the supplied ELEC3117 `Project` directory as the source root:

```sh
python scripts/build-hardware-catalog.py /path/to/ELEC3117/Project \
  --kicad-cli /path/to/kicad-cli \
  --kicad-models /path/to/kicad/3dmodels \
  --only dash \
  --board "dash=Driving Companion/Driving Companion.kicad_pcb"
```

The exporter automatically reads the retained `source-cad` models. It works from a temporary board copy and verifies the original file hash after export. Dash uses the exporter's lossless material batching and identical-vertex interning; the expanded triangle position/normal stream must remain unchanged.
