# Skylabs trainer assets

The model starts with the supplied **Full_Assembly.step**, exported from Autodesk Translation Framework as an AP214 assembly. The original STEP and **Full_Assembly Drawing v1.dwg** remain outside this repository. Neither raw design file is published here. `manifest.json` records the STEP filename, SHA-256, product entity IDs, occurrence IDs and original placements; it does not record the owner's absolute source path.

The DWG's embedded preview was available, but no installed DWG-to-DXF converter was available for trustworthy dimensional extraction. The drawing therefore supplied no reconstructed dimensions. Public appearance references and the workbook/CAD distinction are documented in [the aircraft reference notes](../../../../docs/v3-aircraft-references.md).

## Original and reconstructed geometry

- `parts` contains all **117 original STEP occurrences**, including the original propeller, motor, ribs, spars, control surfaces, fuselage, carbon tubes and main landing-gear bracket. Source geometry is tessellated at 0.15 mm absolute linear deflection and 0.12 radians angular deflection. No mesh decimation is performed. Identical vertex records and repeated mesh definitions are shared without changing their expanded triangle data.
- `derivedParts` contains **22 separate additions**. The absent opposite wing and horizontal-tail structures are mirrored instances of the genuine half assemblies about source Y = −47 mm. Original node names and IDs are retained; mirrored nodes have distinct `derived-left-` names.
- Eleven covering groups use the actual structural cross-sections. These are authored film surfaces, not supplied CAD solids. Their convex outlines bridge frame cutouts, use a 0.5 mm outward normal offset, and place exposed tip caps 0.4 mm beyond the frame. Constant-section envelopes project the whole source assembly, including longitudinal members that have no tessellation vertices at intermediate ribs; this prevents a local vertex slice from cutting the skin into those members. Redundant points in the derived profile are reduced within 0.005 mm before the outward offset, with all resulting contour corners retained during Float32 loft sampling. The original CAD is untouched. The forward fuselage covering follows the supplied nose-connector/firewall region; the motor and carbon tailboom remain exposed. No unverified crest, cowl or spinner is added.
- The user's requested livery places blue on the **outboard flaperons and the fixed horizontal and vertical stabilizers**. The main fixed wing, elevators, rudder and fuselage remain warm white. The chosen blue is **#1858c8**; its shade is a visualization choice, not a colour measured from a photograph. The corresponding glTF material stores the correctly converted linear RGB values.
- The source `landing_gear` is a bracket, **not a complete wheel assembly**. Both main wheels, their axles, and the nose wheel/strut are reconstructed. The 70 mm main tires, 56 mm nose tire, 4 mm nose wire and 2 mm tire-edge rounding are plausible visual proportions, not measured hardware dimensions. The nose strut is registered to the actual nose-mount bore. These additions are not suitable as manufacturing drawings.
- The mirrored horizontal-tail structure spans **0.6 m**, while the workbook's nominal value is **0.7 m**. The source CAD dimensions are preserved. The main wing structure spans 1.5 m; the skin's small clearance extends the visible surface slightly beyond it.

The canonical scene is in metres: nose +X, up +Y, span Z. `sourceToWorldMetres` maps the original millimetre coordinates directly into that frame. The origin is the wing-spar midpoint and fuselage centreline, above the reconstructed main-tire ground plane. All source parts receive the same rigid frame conversion.

The body covering also encloses the actual `Fuselage_Top_Hatch_Balsa v9` surface. Its top reaches source Z = 142.028 mm, above the wing rib's Z = 140.893 mm; using only the wing/side-panel envelope would leave a bare rectangle of hatch wood visible. The hatch remains intact beneath the film and is included in the source-enclosure checks.

## Film boundaries and unwrapping topology

Colour divisions follow named assemblies and their adjacent fixed spars, rather than percentages of the chord:

| Film region | Authoritative source boundary | Colour |
| --- | --- | --- |
| Flaperon, both sides | `Aileron_Assembly v15`: X = 685 mm forward edge, Y = 333–703 mm on the supplied half | Blue |
| Fixed horizontal stabilizer | Fixed plywood spar ends at X = 1562 mm | Blue |
| Elevator, both sides | `Elevator_Assembly v3` starts at X = 1562 mm | Warm white |
| Fixed vertical stabilizer | Fixed plywood spar ends at X = 1536 mm | Blue |
| Rudder | `Rudder_Assembly v6` starts at X = 1536 mm | Warm white |

Source coordinates in this table precede the canonical transform and mirroring. The inboard fixed wing's trailing edge ends at source Y = 327 mm, so the source has a 6 mm gap before the outboard control starts. The film's 0.4 mm end clearances leave a 5.2 mm visible gap. The inner trailing wing therefore remains white; it is not coloured as a full-span flaperon. `filmLivery` and each covering entry's `sourceBoundaryMm` record these decisions.

Each covering entry is a group, containing wrapper sheets and separate end tabs. The two fixed-wing groups each contain an inner full-chord wrapper and an outer leading-section wrapper; every other covering group has one wrapper. This produces **13 wrappers and 26 cap tabs**. Wrapper UVs use normalized perimeter distance U and span/height V. The seam starts at the trailing edge: U = 0 and U = 1 have coincident positions but distinct vertices, and no triangle stitches across them. This allows a sheet to peel and roll without dragging the still-attached section of the covering.

The shared perimeter samples are deduplicated at their final Float32 precision, ensuring strictly increasing U values and avoiding zero-width interpolation intervals. Child mesh/node extras identify `filmSurface`, `peelAxis`, ring counts and centres; cap tabs also identify their end and outward normal. Only reconstructed covering geometry is deformed by the runtime. The original CAD buffers and placements remain intact.

`contacts.landingPose` specifies a 2° nose-up attitude and its vertical registration. The actual tessellated rims of all three tires meet ground Y = 0; the unmodified propeller retains approximately 47.1 mm minimum clearance. The manifest includes local and settled contact coordinates plus the propeller axis/centre. `telemetryMount` records the user-authorized position beneath the wing and the original board's 73.03 × 57.05 mm footprint. The telemetry PCB is loaded separately from its existing authoritative asset; it is not duplicated or simplified in this GLB.

## Delivery and verification

`airframe.glb` is the complete ordinary glTF fallback. Its gzip companion is explicit so the compressed delivery does not depend on the host's MIME compression policy.

`airframe.meshopt.glb` and its gzip companion contain the same geometry through `EXT_meshopt_compression`. The committed meshoptimizer 1.3.0 decoder is loaded only for that transport. Attribute encoding uses level 3, version 0, filter `NONE`; index encoding uses `INDICES`. There is **no quantization, vertex/index reordering or triangle-corner rotation**. The standard GLB remains the fallback when the optional decoder cannot be used.

The final gzip payload is 5,402,507 bytes versus 6,784,619 bytes for the ordinary GLB, a reduction of 1,382,112 bytes. `transport-parity.json` records the source hash and exact decoded-byte result for every one of the 350 buffer views. The transport builder additionally parses both models through the repository's actual Three.js GLTFLoader and compares the resulting node transforms and geometry arrays.

`sourceIntegrity` hashes the original geometry buffers and local transforms. Completion verifies these before and after adding reconstructed parts. The pure geometry check also checks original world placements against the source-to-world conversion, unique node names, real tessellated tire contact and propeller clearance. It asserts the requested blue/white assignments, their actual CAD boundaries, all 13 open UV seams and all 26 separate cap tabs. Each of the 26 wrapper cross-sections is checked against projected original source vertices to detect film cutting into the ribs or continuous structural members.

## Rebuild

Run from the repository root with Python 3.12. The build was verified with `cadquery-ocp` 7.9.3.1.1, NumPy 2.4.4, SciPy 1.17.1 and trimesh 5.1.0. OpenCascade conversion and mesh creation are offline; neither needs a browser or GPU. Mesh compression additionally uses Node and `meshoptimizer` 1.3.0. Install that build-only package under the ignored tooling directory:

```powershell
npm install --prefix .codex-temp/aircraft-tooling --no-save meshoptimizer@1.3.0
python scripts/aircraft-inspect.py --source "<path-to-original>/Full_Assembly.step"
python scripts/build-v3-aircraft-assets.py --source "<path-to-original>/Full_Assembly.step"
python scripts/aircraft-complete.py
node scripts/build-v3-aircraft-transport.mjs
```

The first two build stages accept `--output` for an ignored staging directory. Use staging when another task is displaying the current model, then replace the three completed base files before rebuilding the transport. Raw STEP/DWG files should remain in their source location rather than being copied into the public asset directory.

The original-geometry check requires the Python packages above. The transport check using committed files requires Node only:

```powershell
python scripts/aircraft-verify.py
node scripts/verify-v3-aircraft-transport.cjs
```

For a full encoder reproducibility check, with the pinned build package installed:

```powershell
node scripts/build-v3-aircraft-transport.mjs --verify
```

The decoder's MIT license is retained at `assets/vendor/meshoptimizer.LICENSE.md`. Geometry and visual changes to this aircraft do not require rebaking the unrelated hero environment.
