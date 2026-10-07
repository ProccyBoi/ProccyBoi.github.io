# Skylabs trainer assets

The model starts with the supplied **Full_Assembly.step**, exported from Autodesk Translation Framework as an AP214 assembly. The original STEP and **Full_Assembly Drawing v1.dwg** remain outside this repository. Neither raw design file is published here. `manifest.json` records the STEP filename, SHA-256, product entity IDs, occurrence IDs and original placements; it does not record the owner's absolute source path.

The DWG's embedded preview was available, but no installed DWG-to-DXF converter was available for trustworthy dimensional extraction. The drawing therefore supplied no reconstructed dimensions. Public appearance references and the workbook/CAD distinction are documented in [the aircraft reference notes](../../../../docs/v3-aircraft-references.md).

## Original and reconstructed geometry

- `parts` contains all **117 original STEP occurrences**, including the original propeller, motor, ribs, spars, control surfaces, fuselage, carbon tubes and main landing-gear bracket. Source geometry is tessellated at 0.15 mm absolute linear deflection and 0.12 radians angular deflection. No mesh decimation is performed. Identical vertex records and repeated mesh definitions are shared without changing their expanded triangle data.
- `derivedParts` contains **17 separate additions**. The absent opposite wing and horizontal-tail structures are mirrored instances of the genuine half assemblies about source Y = −47 mm. Original node names and IDs are retained; mirrored nodes have distinct `derived-left-` names.
- Six opaque warm-white film envelopes use the actual structural cross-sections. These are authored covering surfaces, not supplied CAD solids. Their convex outlines bridge frame cutouts, use a 0.5 mm outward normal offset, and place exposed tip caps 0.4 mm beyond the frame. Every envelope corner is retained during loft sampling. The forward fuselage covering follows the supplied nose-connector/firewall region; the motor and carbon tailboom remain exposed. No unverified crest, livery, cowl or spinner is added.
- The source `landing_gear` is a bracket, **not a complete wheel assembly**. Both main wheels, their axles, and the nose wheel/strut are reconstructed. The 70 mm main tires, 56 mm nose tire, 4 mm nose wire and 2 mm tire-edge rounding are plausible visual proportions, not measured hardware dimensions. The nose strut is registered to the actual nose-mount bore. These additions are not suitable as manufacturing drawings.
- The mirrored horizontal-tail structure spans **0.6 m**, while the workbook's nominal value is **0.7 m**. The source CAD dimensions are preserved. The main wing structure spans 1.5 m; the skin's small clearance extends the visible surface slightly beyond it.

The canonical scene is in metres: nose +X, up +Y, span Z. `sourceToWorldMetres` maps the original millimetre coordinates directly into that frame. The origin is the wing-spar midpoint and fuselage centreline, above the reconstructed main-tire ground plane. All source parts receive the same rigid frame conversion.

`contacts.landingPose` specifies a 2° nose-up attitude and its vertical registration. The actual tessellated rims of all three tires meet ground Y = 0; the unmodified propeller retains approximately 47.1 mm minimum clearance. The manifest includes local and settled contact coordinates plus the propeller axis/centre. `telemetryMount` records the user-authorized position beneath the wing and the original board's 73.03 × 57.05 mm footprint. The telemetry PCB is loaded separately from its existing authoritative asset; it is not duplicated or simplified in this GLB.

## Delivery and verification

`airframe.glb` is the complete ordinary glTF fallback. Its gzip companion is explicit so the compressed delivery does not depend on the host's MIME compression policy.

`airframe.meshopt.glb` and its gzip companion contain the same geometry through `EXT_meshopt_compression`. The committed meshoptimizer 1.3.0 decoder is loaded only for that transport. Attribute encoding uses level 3, version 0, filter `NONE`; index encoding uses `INDICES`. There is **no quantization, vertex/index reordering or triangle-corner rotation**. The standard GLB remains the fallback when the optional decoder cannot be used.

The final gzip payload is 5,382,814 bytes versus 6,714,625 bytes for the ordinary GLB, a reduction of 1,331,811 bytes. `transport-parity.json` records the source hash and exact decoded-byte result for every one of the 238 buffer views. The transport builder additionally parses both models through the repository's actual Three.js GLTFLoader and compares the resulting node transforms and geometry arrays.

`sourceIntegrity` hashes the original geometry buffers and local transforms. Completion verifies these before and after adding reconstructed parts. The pure geometry check also checks original world placements against the source-to-world conversion, unique node names, real tessellated tire contact and propeller clearance.

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
