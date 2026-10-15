# Populated Kiku PCB browser assets

The v2 Kiku page uses `pcb.json`, `pcb.bin` (or `pcb.bin.gz` with gzip decoding),
`pcb-provenance.json` and the included license notices. Fallback artwork is
captured from the browser WebGL renderer. The downloaded source model library,
raw intermediate GLBs and font files are not included in the portfolio. All production meshes are one group `pcb` with original shared
mechanical XYZ millimetre coordinates. Never recenter parts individually.

- `componentCount: 133`; counts: 111 official model instances, 21 numeric vendor
  envelope proxies, 1 existing unverified D3 allowance.
- 27 meshes, separated by original material, 273,533 triangles.
- 9,783,660-byte packed binary; gzip transport is 2,159,582 bytes.
- Every packed component bound matches the reviewed numeric source within
  0.000004 mm. All footprint transforms match current KiCad source.
- Source PCB placements align with the retained P2 shell datum frame. No XY
  correction, geometry rescaling or individually centered parts are required.
- Native KiCad exports the laminate at Z0..1.51 mm with separate coatings.
  Component placement is explicitly shifted +0.005 mm from its native GLB datum
  1.595 mm to the reviewed source reference datum of 1.600 mm.

## Browser binary

Typed-array fields have byteOffset, byteLength, count, itemSize, componentType.
Position/normal are little-endian Float32; index is Uint32; offsets align to 4.
Each part exposes color (sRGB hex), optional colorLinear, opacity, roughness,
metalness, group, name, description, bounds, size and explode [0,0,0]. Preserve
opacity on soldermask/silkscreen and material separation. When transparent,
set depthWrite=false, using proper depth testing against the populated parts.

Optional transport: fetch manifest.binaryGzip; use
`new Response(response.body.pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()`
when supported, otherwise use the plain binary. Compare the decompressed hash
against binarySha256 for verification. The typed-array layout is identical.

`pcb-provenance.json` stores `componentTriangleRangesByMesh`, retaining exact triangle-to-reference attribution after
material batching. Use for independent component bound reconstruction. A whole
PCB selection is appropriate; it is not 133 independent enclosure parts.

## Rebuild and verify

KiCad 9.0.2 and the exact public source commit are required. Build dependencies:
NumPy and SciPy. `fetch_official_models.py` fetches only referenced paths from the
official KiCad 9.0.2 release plus its license. D3 correctly returns 404. Local
vendor models are never fetched, copied or reconstructed. See the provenance
manifest for source and license URLs.

The working `board.glb` is exported using:

    kicad-cli pcb export glb --force --board-only --include-tracks --include-pads --include-zones --include-silkscreen --include-soldermask --user-origin 72.11x157.90mm -o board.glb 'Walkman - Blobject.kicad_pcb'

`components.glb` is exported using the same origin without `--board-only` and
with KICAD9_3DMODEL_DIR pointing at the fetched official model tree. It contains
a duplicate board body which the browser converter intentionally discards.
Ubuntu Mono from the official Ubuntu 0.83 archive must be visible to Fontconfig
for the board's four custom-font labels. KiCad CLI logs must have no font
substitution warning. Exports do not mutate the PCB.

    python scripts/kiku-pcb/fetch_official_models.py --source-root /path/to/kiku --work-root /tmp/kiku-build
    python scripts/kiku-pcb/build_browser_assets.py --source-root /path/to/kiku --work-root /tmp/kiku-build
    python scripts/kiku-pcb/verify_assets.py assets/models/kiku-pcb /path/to/kiku

The independent verifier parses current source S-expressions and validates all
142 footprint placements, 133 model transforms, source/binary hashes, decompressed
bytes, index ranges, finite/unit normals, materials, 133 reconstructed component
bounds and official source revisions. The historical SHA stored in board_datums
is distinguished from the actual source SHA in provenance.

## Limits

Envelopes are intentionally simple boxes. Their placement and bounds are exact
source metadata; package shape, connector internals, actuator form and vendor
finish are not represented. D3 retains its original UNVERIFIED status. External
copper top/bottom surfaces are exact native export tessellations; micrometre-thick
coating sidewalls and internal copper layers are omitted to reduce load. Source
holes and board substrate geometry are retained. This is a CAD visualization,
not a fit, electrical or manufacturing validation.
