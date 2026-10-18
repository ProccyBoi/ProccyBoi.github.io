# Finished component package geometry

The original board and 111 official KiCad model instances are preserved. U10 now
uses KiCad 9.0.2's LQFP-100 14 × 14 mm / 0.5 mm-pitch compatible package under
CC-BY-SA-4.0 with the KiCad design/generated-file exception. It is rotated to
match the custom source pad numbering, never rescaled. The exact fetched URL and
SHA-256 are recorded per component in `pcb-provenance.json`.

The remaining 21 former envelope boxes are independent display reconstructions:
20 source-dimensioned packages plus the explicitly unverified D3 allowance.
They use the public project's placement records, bounds and source pad centers.
The BM83, FPC and encoder also cite public manufacturer drawings in provenance.
Their authored geometry is released under CERN-OHL-P-2.0; the generator is MIT.
No excluded vendor CAD was recovered, downloaded or redistributed.

Visible additions include hollow USB-C and U.FL sockets, FPC cable opening and
contacts, BM83 PCB/shield/castellations/antenna zone, encoder D shaft and bushing,
tact-switch actuators, QFN lands, power-inductor terminations and crystal lids.
The antenna trace motif is illustrative, not an RF layout.

## Important source discrepancy

SW2's BOM says PEC11L-4120F-S0020, but the assigned footprint and old model say
PEC11R. The manufacturer PEC11L drawing has different mounting-tab spacing and
a 20 mm shaft measured above the body. The historical source envelope ends at
Z21.10009 mm; it is retained here. Neither shaft fit nor enclosure compatibility
is verified. D3 remains an unidentified/unverified two-terminal allowance.

## Rebuild

After the native build, run:

    python scripts/kiku-pcb/finish_component_packages.py --source-root /path/to/kiku --work-root /tmp/kiku-build
    python scripts/kiku-pcb/verify_assets.py assets/models/kiku-pcb /path/to/kiku

The finisher is deterministic and can run against either the original generated
assets or its own finished output. It downloads only the pinned official KiCad
compatible package; it never reads excluded vendor model files.

These are reviewable browser illustrations, not manufacturing or fit models.
