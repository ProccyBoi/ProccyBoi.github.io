# Dash device assembly

The interactive assembly combines the supplied Dash base and lid, the Driving Companion PCB and dimensioned representations of the display, speaker, battery, cable plugs, top magnets and metal capacitive touch plate. Its assembled enclosure envelope is 50 × 52 × 48 mm.

## Housing and added parts

`base.stl` and `lid.stl` retain the unchanged triangle geometry of the supplied `Base Man (2).stl` and `Lid Man (1).stl`. Their source hashes are recorded in `housing-sources.json`. The assembled transform is applied by the viewer. The board is presented with a black solder mask.

The other device parts are visual representations, with sources and limitations in `device-sources.json`:

- The four-pin blue OLED module follows the supplied build photos and the user identification GME12864-80. Its approximate PCB is 35.5 × 33.6 mm, with the header at the top. Current GoldenMorning 88/89 module drawings guide the notched board, panel, mounting holes and header dimensions; the manufacturer now uses the -80 label for a bare panel, so the exact module revision is not established. The 1.2 mm PCB and 1.4 mm glass form a contiguous stack. Its glass face sits 0.1 mm behind the enclosure's inner front wall, with its active area aligned to the opening; this gap is an illustrative assembly allowance.
- The speaker is identified as LCSC C49247039, XHXDZ 2831BOX-4Ω3W-2P1.25. Its 31 × 28 × 15.2 mm casing follows a manufacturer drawing for the same 2831BOX family. Mounting ears are omitted to follow the photographed enclosure. That drawing covers an 8 Ω / 2.0 mm connector sibling, so it is not exact CAD for the specified 4 Ω / 1.25 mm connector variant.
- The 3.7 V, 1000 mAh LiPo is approximately 35 × 25 × 10 mm, using the user's estimated measurement. Its placement is illustrative: the supplied photos show it outside the assembled enclosure. The label `192535` has not been independently resolved to a manufacturer drawing.
- C131337 is the JST B2B-PH-K-S board header. Its mating cable housing uses the official PHR-2 dimensions, 5.8 × 4.5 × 6.85 mm at 2 mm pitch. C398568 denotes green PHR-2-M; the viewer uses the same housing form in natural ivory as requested.
- The top magnets, metal touch plate and wire paths follow the photos and housing features. Their details and placements are illustrative.

The source housing and PCB geometry are retained, but the additional parts and their placement do not establish manufacturing clearances, cable routing or a physical fit check. The original vehicle-prototype photos remain separate from this assembly visualization.

## Exploded view

The base moves 70 mm below the assembly, clearing the PCB completely. Individual magnets, the touch plate and disc, all four wiring looms and the off-board components have separate paths. The 66 PCB components retain their assembled source transforms and spread into a plane with at least 2.5 mm between their bounding boxes. The camera follows the current device bounds so the assembled view remains large while the expanded view stays in frame. Reassembly restores the original transforms exactly.

`node scripts/verify-dash-device.cjs` checks source mesh fidelity, upright display orientation, glass clearance, exploded part separation, framing and exact reassembly on desktop and mobile. Like the existing viewer checks, it uses `V2_BASE_URL` and optional `CHROMIUM_EXECUTABLE`.

## PCB source

Generated from `Driving Companion/Driving Companion.kicad_pcb` in the supplied ELEC3117 project folder. This is the board saved on 28 September 2025, newer than the separate `Driving Companion V2` board saved on 1 August 2025. The older July STL is not used.

The authored board is 45.2 × 45.2 × 1.6 mm, with 2 mm corner radii and three M2 mounting holes. The browser export preserves its placements, pads, silkscreen, mask openings and board outline. The source SHA-256 is `88fb822d575644c5412ef8758e3cd9f3ed03730aa67f322563188b7846269b9e`.

## Model provenance

- Standard component bodies use the original referenced KiCad 9.0.2 library geometry.
- U7's exact `QFN-24-1EP_4x4mm_P0.5mm_EP2.7x2.6mm` model was recovered from the official KiCad 6.0.11 library. Its original attribution and library exception are retained in `source-cad`.
- J1 uses the exact HRO TYPE-C-31-M-12 model already retained for the site's LoRa board. The documented 180° / 1.05 mm registration aligns its locating bosses, contacts and shell with this same authored footprint. It is recorded in `modelRegistrations`.
- U1 uses the official KiCad 3.9 × 4.9 mm SOIC-8 package with matching lead count and 1.27 mm pitch. Its underside exposed pad is 2.41 × 3.81 mm, compared with the source footprint's 2.41 × 3.3 mm.
- U6 uses the official KiCad 3 × 3 mm TQFN-16 package with matching 0.5 mm lead pitch. Its underside exposed pad is 1.6 × 1.6 mm, compared with the source footprint's 1.23 × 1.23 mm.
- U5 originally had no assigned body. The source explicitly identifies SOT-23-6 UMW, a centred 1.6 × 3.0 mm fabrication outline and six pads at 0.95 mm pitch. The official KiCad SOT-23-6 package is placed at the unchanged footprint centre and rotation. Its 1.55 mm library height exceeds the footprint's 1.40 mm maximum, so it is a display-only package representation, not recovered UMW CAD or housing-fit geometry.

U1, U6 and U5 are explicitly identified as package-library representations in `packageLibraryFallbacks`, including the library hashes and limitations. The two exposed-pad alternatives do not change the original PCB pad geometry. These assets are for interactive presentation, not manufacturing clearance verification.

`assembly.json` distinguishes source-assigned models, exported bodies, unresolved assigned models and source footprints that never had a body. Mounting holes and the rear logo do not require separate component bodies. Exact source URLs and hashes for recovered files are in `source-cad/sources.json`.

The PCB export has 66 component bodies across 71 footprints: 65 of the 66 source-assigned models plus the documented U5 representation. LS1's Molex PicoBlade 53047-0210 body remains unresolved; its original holes, pads and silkscreen are preserved. The other four footprints are the three mounting holes and rear logo. The added speaker body does not resolve the missing PCB connector body.

## Rebuild the PCB

From the website repository, with the supplied ELEC3117 `Project` directory as the source root:

```sh
python scripts/build-hardware-catalog.py /path/to/ELEC3117/Project \
  --kicad-cli /path/to/kicad-cli \
  --kicad-models /path/to/kicad/3dmodels \
  --only dash \
  --board "dash=Driving Companion/Driving Companion.kicad_pcb"
```

The exporter automatically reads the retained `source-cad` models. It works from a temporary board copy and verifies the original file hash after export. Dash uses the exporter's lossless material batching and identical-vertex interning; the expanded triangle position/normal stream must remain unchanged.
