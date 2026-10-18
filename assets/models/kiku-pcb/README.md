# Populated Kiku PCB browser assets

The page uses `pcb.json`, `pcb.bin` (or `pcb.bin.gz`), `pcb-provenance.json`
and the included license notices. All meshes remain in group `pcb` in the
original shared mechanical XYZ millimetre coordinates. Do not recenter parts.

- 133 model references: 111 unchanged official KiCad model instances, one
  official compatible LQFP-100 package, 20 source-dimensioned package
  reconstructions, and one explicitly unverified D3 reconstruction.
- No rectangular component envelope proxies remain.
- 34 material meshes; 302,985 triangles; 11,270,556-byte binary, 2,385,325 gzip bytes.
- Native board and original official position/normal/index attributes are kept
  unchanged. All 142 source footprint placements and 133 source model transforms
  remain attributable to the unmodified current KiCad source.
- Reconstructed packages retain the reviewed bounds within 0.0001 mm. The
  unscaled compatible U10 package differs by at most 0.001022 mm, disclosed in
  provenance and independently tested with a 0.005 mm package tolerance.

The finished geometry includes USB-C and U.FL socket openings, contact surfaces,
FPC latch and cable channel, BM83 substrate/shield/castellations/antenna zone,
encoder D shaft/bushing/lugs, tactile-switch actuators, MCU gull-wing leads,
QFN/DFN lands, inductor terminals and crystal lids. These are display packages,
not recovered excluded vendor CAD. See `PACKAGE-RECONSTRUCTIONS.md` for the
important PEC11L/PEC11R encoder discrepancy and other fidelity limits.

## Browser binary

Typed-array fields have byteOffset, byteLength, count, itemSize, componentType.
Position/normal are little-endian Float32; index is Uint32; offsets align to 4.
Each part exposes sRGB color, optional colorLinear, opacity, roughness,
metalness, group, name, description, bounds, size and explode [0,0,0]. Preserve
material separation and transparency; transparent board coatings need depth
write disabled while retaining depth testing against populated components.

Optional gzip transport uses `manifest.binaryGzip` with DecompressionStream,
falling back to `manifest.binary`. The decompressed bytes must hash to
`binarySha256`; both transports have identical typed-array layout.

`componentTriangleRangesByMesh` in provenance retains triangle-to-reference
attribution after material batching. Per-reference fidelity, bounds, source
placement, model expression, and source URLs distinguish original official
models, compatible packages, independent reconstructions and unverified parts.

## Rebuild and verify

Native rebuild needs KiCad 9.0.2, the exact public source commit, NumPy and SciPy.
The model fetcher downloads the referenced official KiCad 9.0.2 models and their
license. The finisher additionally downloads one SHA-256-pinned licensed KiCad
LQFP-100 package. No local/vendor models are read, fetched or redistributed.

Export `board.glb` with:

    kicad-cli pcb export glb --force --board-only --include-tracks --include-pads --include-zones --include-silkscreen --include-soldermask --user-origin 72.11x157.90mm -o board.glb 'Walkman - Blobject.kicad_pcb'

Export `components.glb` at the same origin, without `--board-only`, with
KICAD9_3DMODEL_DIR pointing to the fetched official tree. Ubuntu Mono 0.83 must
be visible to Fontconfig for the custom board labels. Export logs must have no
font substitution warning. The converter discards the duplicate board body.

    python scripts/kiku-pcb/fetch_official_models.py --source-root /path/to/kiku --work-root /tmp/kiku-build
    python scripts/kiku-pcb/build_browser_assets.py --source-root /path/to/kiku --work-root /tmp/kiku-build
    python scripts/kiku-pcb/verify_assets.py assets/models/kiku-pcb /path/to/kiku

The main builder runs the finishing stage automatically. To upgrade a previous
packed asset or deterministically regenerate only the finished packages:

    python scripts/kiku-pcb/finish_component_packages.py --source-root /path/to/kiku --work-root /tmp/kiku-build

The independent verifier parses current source S-expressions and validates all
placements/transforms, source and binary hashes, gzip bytes, indices, finite/unit
normals, materials, complete component triangle attribution, actual per-reference
bounds, richer topology for all 22 replacements, official source revisions, and
explicit uncertainty for D3/SW2.

## Coordinate and fidelity limits

Native KiCad laminate spans Z0..1.51 mm, with separate coatings. Component
placement preserves the existing explicit +0.005 mm correction from native GLB
front datum 1.595 mm to reviewed 1.600 mm. No XY recentering or overall rescaling
is applied. Source holes, board surfaces and laminate geometry are unchanged.

Internal copper layers and micrometre-thick coating sidewalls remain omitted.
Nine footprints without assigned 3D models are mounting holes or test pads and
retain their board/pad features. Reconstructed curves, connector internals, RF
antenna motif and finishes are simplified. No fit, electrical, RF or manufacturing
validation is claimed.
